import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";

const CSV_PATH = "/Users/baptistegaultier/Desktop/Firecrawl Rusard /annuaire-des-entreprises-etablissements-10_03_2026.csv";
const API_URL = "http://localhost:3002/api/projects";

// Read and parse CSV
const raw = readFileSync(CSV_PATH, "utf-8");
const records = parse(raw, { columns: true, skip_empty_lines: true });

console.log(`Parsed ${records.length} rows`);
console.log("Sample columns:", Object.keys(records[0]).slice(0, 10));

// Select relevant columns for real estate agency enrichment
const KEEP_COLS = [
  "siren",
  "siret",
  "denominationUniteLegale",
  "denominationUsuelleEtablissement",
  "enseigne1Etablissement",
  "numeroVoieEtablissement",
  "typeVoieEtablissement",
  "libelleVoieEtablissement",
  "complementAdresseEtablissement",
  "codePostalEtablissement",
  "libelleCommuneEtablissement",
  "activitePrincipaleEtablissement",
  "etatAdministratifEtablissement",
  "etatAdministratifUniteLegale",
  "categorieJuridiqueUniteLegale",
  "trancheEffectifsEtablissement",
];

// Build clean rows
const cleanRows = records
  .filter(r => r.etatAdministratifEtablissement === "A") // Only active establishments
  .map(r => {
    const row = {};
    for (const col of KEEP_COLS) {
      row[col] = r[col] || "";
    }
    // Build a readable address
    const parts = [
      r.numeroVoieEtablissement,
      r.typeVoieEtablissement,
      r.libelleVoieEtablissement,
    ].filter(Boolean);
    if (r.complementAdresseEtablissement) parts.unshift(r.complementAdresseEtablissement);
    row["adresse"] = parts.join(" ");
    row["ville"] = `${r.codePostalEtablissement} ${r.libelleCommuneEtablissement}`.trim();
    // Use denomination or enseigne as company name
    row["nom_entreprise"] = r.denominationUniteLegale || r.denominationUsuelleEtablissement || r.enseigne1Etablissement || "";
    return row;
  });

console.log(`Active establishments: ${cleanRows.length}`);

// Get columns from first row
const columns = Object.keys(cleanRows[0]);

// Send to API
const body = JSON.stringify({
  name: "Agences Immobilières France - Mars 2026",
  columns,
  rows: cleanRows,
});

// Import directly via Neon to avoid per-row HTTP calls through the API
import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";

const DATABASE_URL = "postgresql://neondb_owner:npg_UX7nexR1yaIN@ep-old-haze-ad6yyf9d-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require";
const sql = neon(DATABASE_URL);

const projectId = nanoid();
const now = Date.now();
const projectName = "Agences Immobilières France - Mars 2026";

// Create project
await sql`INSERT INTO projects (id, name, created_at, updated_at, columns, status, row_count, mode)
  VALUES (${projectId}, ${projectName}, ${now}, ${now}, ${JSON.stringify(columns)}, 'draft', ${cleanRows.length}, 'standard')`;

console.log(`Project created: ${projectId}`);

// Insert rows in batches of 50
const BATCH = 50;
for (let i = 0; i < cleanRows.length; i += BATCH) {
  const batch = cleanRows.slice(i, i + BATCH);
  const values = batch.map((row, j) => [nanoid(), projectId, i + j, JSON.stringify(row)]);

  // Build a multi-value INSERT
  const placeholders = values.map((_, idx) => `($${idx*4+1}, $${idx*4+2}, $${idx*4+3}, $${idx*4+4})`).join(", ");
  const flat = values.flat();

  await sql.query(
    `INSERT INTO rows (id, project_id, row_index, data) VALUES ${placeholders}`,
    flat
  );

  const done = Math.min(i + BATCH, cleanRows.length);
  process.stdout.write(`\rInserted ${done}/${cleanRows.length} rows`);
}

console.log("\nDone! Project ID:", projectId);
