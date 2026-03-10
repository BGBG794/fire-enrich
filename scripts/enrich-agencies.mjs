import { neon } from "@neondatabase/serverless";

const DATABASE_URL = "postgresql://neondb_owner:npg_UX7nexR1yaIN@ep-old-haze-ad6yyf9d-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require";
const API_URL = "http://localhost:3002/api/enrich";
const sql = neon(DATABASE_URL);

// Get project
const projects = await sql`SELECT id, name, row_count FROM projects ORDER BY created_at DESC LIMIT 1`;
const project = projects[0];
console.log(`Project: ${project.name} (${project.row_count} rows)`);

// Get established agencies (with employees or enseigne) for better enrichment
const TARGET_INDICES = [222, 291, 293, 298, 329]; // Alexandre Gay, Zingraf, Valority, IEL, Espaces Atypiques
const rows = await sql`SELECT data, row_index FROM rows WHERE project_id = ${project.id} AND row_index = ANY(${TARGET_INDICES}) ORDER BY row_index`;
const csvRows = rows.map(r => JSON.parse(r.data));

console.log(`Testing with ${csvRows.length} rows:`);
csvRows.forEach((r, i) => console.log(`  ${i + 1}. ${r.nom_entreprise} — ${r.ville}`));

// Pipeline config
const pipelineConfig = {
  identifierColumn: "nom_entreprise",
  steps: [
    {
      id: "step-1",
      order: 0,
      name: "Site Web & Contact",
      type: "web_research",
      prompt: "Trouve le site web officiel de cette agence immobilière française et ses coordonnées de contact. Cherche l'adresse email générique de l'agence (contact@, info@, agence@, etc.) et le numéro de téléphone.",
      outputFields: [
        {
          name: "site_web",
          displayName: "Site Web",
          description: "URL du site web officiel de l'agence immobilière",
          type: "string",
          required: false,
        },
        {
          name: "email_generique",
          displayName: "Email Générique",
          description: "Adresse email de contact de l'agence (contact@, info@, agence@...)",
          type: "string",
          required: false,
        },
        {
          name: "telephone",
          displayName: "Téléphone",
          description: "Numéro de téléphone de l'agence",
          type: "string",
          required: false,
        },
      ],
      inputColumns: ["nom_entreprise", "ville", "adresse"],
      usePreviousSteps: false,
    },
    {
      id: "step-2",
      order: 1,
      name: "Dirigeant",
      type: "web_research",
      prompt: "Trouve le dirigeant (gérant, directeur, président, CEO) de cette agence immobilière. Cherche son nom complet, son titre/poste, et si possible son profil LinkedIn et son adresse email professionnelle.",
      outputFields: [
        {
          name: "dirigeant_nom",
          displayName: "Nom du Dirigeant",
          description: "Nom complet du dirigeant de l'agence",
          type: "string",
          required: false,
        },
        {
          name: "dirigeant_poste",
          displayName: "Poste du Dirigeant",
          description: "Titre ou poste du dirigeant (Gérant, Directeur, etc.)",
          type: "string",
          required: false,
        },
        {
          name: "dirigeant_linkedin",
          displayName: "LinkedIn du Dirigeant",
          description: "URL du profil LinkedIn du dirigeant",
          type: "string",
          required: false,
        },
        {
          name: "dirigeant_email",
          displayName: "Email du Dirigeant",
          description: "Adresse email professionnelle du dirigeant",
          type: "string",
          required: false,
        },
      ],
      inputColumns: ["nom_entreprise", "ville"],
      usePreviousSteps: true,
    },
  ],
};

// Call enrichment API
console.log("\nLancement de l'enrichissement pipeline...\n");

const resp = await fetch(API_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    rows: csvRows,
    projectId: project.id,
    pipelineConfig,
  }),
  signal: AbortSignal.timeout(600_000), // 10 min timeout
});

if (!resp.ok) {
  const text = await resp.text();
  console.error(`API error ${resp.status}:`, text);
  process.exit(1);
}

// Read SSE stream
const reader = resp.body.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";

  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const json = line.slice(6);
    try {
      const event = JSON.parse(json);

      switch (event.type) {
        case "session":
          console.log(`Session: ${event.sessionId}`);
          break;
        case "processing":
          console.log(`\n--- Processing row ${event.rowIndex + 1}/${event.totalRows} ---`);
          break;
        case "step_progress":
          console.log(`  [${event.stepName}] ${event.message}`);
          break;
        case "step_complete":
          console.log(`  [${event.stepId}] Step complete`);
          break;
        case "agent_progress":
          const icon = event.messageType === "success" ? "✓" : event.messageType === "warning" ? "!" : "→";
          console.log(`  ${icon} ${event.message}`);
          break;
        case "result": {
          const r = event.result;
          const name = r.originalData?.nom_entreprise || `Row ${r.rowIndex}`;
          console.log(`\n  === ${name} (${r.status}) ===`);
          if (r.status === "completed") {
            for (const [key, val] of Object.entries(r.enrichments)) {
              console.log(`    ${key}: ${JSON.stringify(val.value)}`);
            }
          } else if (r.error) {
            console.log(`    Error: ${r.error}`);
          }
          break;
        }
        case "complete":
          console.log("\n✓ Enrichissement terminé !");
          break;
        case "error":
          console.error(`\nERROR: ${event.error}`);
          break;
      }
    } catch {
      // skip malformed JSON
    }
  }
}
