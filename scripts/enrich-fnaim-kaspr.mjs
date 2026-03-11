import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";

const DATABASE_URL = "postgresql://neondb_owner:npg_UX7nexR1yaIN@ep-old-haze-ad6yyf9d-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require";
const KASPR_KEY = "H0R4G3F4-P4Z0Q4Z5-G3B3Y3T0-V7E1U0E1";
const KASPR_BASE = "https://myapiconnect.com/api-product/incoming-webhook";
const sql = neon(DATABASE_URL);

// ─── KASPR API helpers ──────────────────────────────────────

async function kasprPost(endpoint, data) {
  const resp = await fetch(`${KASPR_BASE}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: KASPR_KEY, ...data }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) throw new Error(`KASPR ${endpoint} HTTP ${resp.status}`);
  return resp.json();
}

async function convertCompanyName(companyName) {
  const res = await kasprPost("convert-company-names", { company_name: companyName });
  if (res.state && res.data?.length > 0) return res.data[0].domain;
  return null;
}

async function extractFromUrl(url) {
  const res = await kasprPost("extract-emails-from-urls", { url: url.startsWith("http") ? url : `https://${url}` });
  if (res.state && res.data) return res.data;
  return null;
}

async function enrichCompany(domain) {
  const res = await kasprPost("enrich-company", { domain });
  if (res.state && res.employees) return res.employees;
  return [];
}

// ─── Load FNAIM rows ───────────────────────────────────────

const projects = await sql`SELECT id, name, row_count FROM projects ORDER BY created_at DESC LIMIT 1`;
const project = projects[0];
console.log(`Project: ${project.name} (${project.row_count} rows)\n`);

// Load only FNAIM rows (source = "FNAIM" in JSON data)
const allRows = await sql`SELECT id, data, row_index FROM rows WHERE project_id = ${project.id} ORDER BY row_index`;
const fnaim = allRows
  .map(r => ({ id: r.id, rowIndex: r.row_index, ...JSON.parse(r.data) }))
  .filter(d => d.source === "FNAIM");

console.log(`FNAIM agencies to enrich: ${fnaim.length}\n`);

// Check which ones already have enrichment results
const existing = await sql`SELECT DISTINCT row_id FROM enrichment_results WHERE project_id = ${project.id} AND step_name = 'KASPR'`;
const alreadyEnriched = new Set(existing.map(e => e.row_id));
const toEnrich = fnaim.filter(d => !alreadyEnriched.has(d.id));
console.log(`Already enriched: ${fnaim.length - toEnrich.length}, remaining: ${toEnrich.length}\n`);

if (toEnrich.length === 0) {
  console.log("All FNAIM agencies already enriched!");
  process.exit(0);
}

// ─── Enrichment ─────────────────────────────────────────────

const results = [];
const now = Date.now();

for (let i = 0; i < toEnrich.length; i++) {
  const agency = toEnrich[i];
  const name = agency.nom_entreprise;
  console.log(`\n[${i + 1}/${toEnrich.length}] ${name}`);
  if (agency.adresse) console.log(`  ${agency.adresse}`);

  const enrichment = {
    row_id: agency.id,
    row_index: agency.rowIndex,
    nom_entreprise: name,
    domain: null,
    site_web: null,
    email_generique: null,
    telephone: null,
    linkedin_url: null,
    facebook_url: null,
    instagram_url: null,
    dirigeant_nom: null,
    dirigeant_poste: null,
    dirigeant_email: null,
    dirigeant_linkedin: null,
  };

  try {
    // Step 1: Find domain from company name
    console.log("  → Converting company name to domain...");
    const domain = await convertCompanyName(name);
    if (domain) {
      enrichment.domain = domain;
      enrichment.site_web = `https://${domain}`;
      console.log(`  ✓ Domain: ${domain}`);

      // Step 2: Extract emails/phones from website
      console.log("  → Extracting contact info from website...");
      try {
        const siteData = await extractFromUrl(domain);
        if (siteData) {
          if (siteData.company_email) {
            const emails = siteData.company_email.split(",").map(e => e.trim()).filter(Boolean);
            const generic = emails.find(e => /^(contact|info|agence|accueil|hello|bonjour)@/i.test(e));
            enrichment.email_generique = generic || emails[0] || null;
            if (enrichment.email_generique) console.log(`  ✓ Email: ${enrichment.email_generique}`);
          }
          if (siteData.phones) {
            const phones = siteData.phones.split(",").map(p => p.trim()).filter(Boolean);
            enrichment.telephone = phones[0] || null;
            if (enrichment.telephone) console.log(`  ✓ Tel: ${enrichment.telephone}`);
          }
          if (siteData.linkedin_url) enrichment.linkedin_url = siteData.linkedin_url;
          if (siteData.facebook_url) enrichment.facebook_url = siteData.facebook_url;
          if (siteData.instagram_url) enrichment.instagram_url = siteData.instagram_url;
        }
      } catch (e) {
        console.log(`  ! Extract error: ${e.message}`);
      }

      // Step 3: Enrich company → find dirigeant
      console.log("  → Enriching company (finding employees)...");
      try {
        const employees = await enrichCompany(domain);
        if (employees.length > 0) {
          const dirigeantKeywords = /\b(ceo|president|président|gérant|gerant|directeur|director|founder|fondateur|owner|propriétaire|managing|general manager|dg|pdg|chief executive)\b/i;
          const dirigeant = employees.find(e => dirigeantKeywords.test(e.job_title || "") || dirigeantKeywords.test(e.headline || ""));

          if (dirigeant) {
            enrichment.dirigeant_nom = `${dirigeant.first_name} ${dirigeant.last_name}`.trim();
            enrichment.dirigeant_poste = dirigeant.job_title || dirigeant.headline;
            enrichment.dirigeant_email = dirigeant.business_email || dirigeant.personal_email || null;
            enrichment.dirigeant_linkedin = dirigeant.social_url || null;
            console.log(`  ✓ Dirigeant: ${enrichment.dirigeant_nom} (${enrichment.dirigeant_poste})`);
            if (enrichment.dirigeant_email) console.log(`  ✓ Email dirigeant: ${enrichment.dirigeant_email}`);
          } else {
            const first = employees[0];
            enrichment.dirigeant_nom = `${first.first_name} ${first.last_name}`.trim();
            enrichment.dirigeant_poste = first.job_title || first.headline;
            enrichment.dirigeant_email = first.business_email || first.personal_email || null;
            enrichment.dirigeant_linkedin = first.social_url || null;
            console.log(`  ~ Contact (pas dirigeant): ${enrichment.dirigeant_nom} (${enrichment.dirigeant_poste})`);
          }
          console.log(`  ✓ ${employees.length} employés trouvés au total`);
        } else {
          console.log("  ! Aucun employé trouvé");
        }
      } catch (e) {
        console.log(`  ! Enrich error: ${e.message}`);
      }
    } else {
      console.log("  ! Domaine non trouvé");
    }
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}`);
  }

  results.push(enrichment);

  // Save to DB
  const fields = [
    ["site_web", enrichment.site_web],
    ["email_generique", enrichment.email_generique],
    ["telephone", enrichment.telephone],
    ["linkedin_url", enrichment.linkedin_url],
    ["facebook_url", enrichment.facebook_url],
    ["instagram_url", enrichment.instagram_url],
    ["dirigeant_nom", enrichment.dirigeant_nom],
    ["dirigeant_poste", enrichment.dirigeant_poste],
    ["dirigeant_email", enrichment.dirigeant_email],
    ["dirigeant_linkedin", enrichment.dirigeant_linkedin],
  ];

  for (const [fieldName, value] of fields) {
    if (value) {
      await sql`INSERT INTO enrichment_results (id, project_id, row_id, field_name, value, confidence, status, created_at, step_name)
        VALUES (${nanoid()}, ${project.id}, ${agency.id}, ${fieldName}, ${JSON.stringify(value)}, ${0.9}, 'completed', ${now}, 'KASPR')`;
    }
  }

  // Small delay
  await new Promise(r => setTimeout(r, 500));
}

// ─── Summary ────────────────────────────────────────────────

console.log("\n\n═══ RÉSUMÉ FNAIM ═══");
const withDomain = results.filter(r => r.domain);
const withEmail = results.filter(r => r.email_generique);
const withPhone = results.filter(r => r.telephone);
const withDirigeant = results.filter(r => r.dirigeant_nom);
const withDirigeantEmail = results.filter(r => r.dirigeant_email);

console.log(`Total agences FNAIM traitées: ${results.length}`);
console.log(`Domaine trouvé: ${withDomain.length} (${Math.round(withDomain.length/results.length*100)}%)`);
console.log(`Email générique: ${withEmail.length} (${Math.round(withEmail.length/results.length*100)}%)`);
console.log(`Téléphone: ${withPhone.length} (${Math.round(withPhone.length/results.length*100)}%)`);
console.log(`Dirigeant identifié: ${withDirigeant.length} (${Math.round(withDirigeant.length/results.length*100)}%)`);
console.log(`Email dirigeant: ${withDirigeantEmail.length} (${Math.round(withDirigeantEmail.length/results.length*100)}%)`);

console.log("\n✓ Enrichissement FNAIM terminé !");
