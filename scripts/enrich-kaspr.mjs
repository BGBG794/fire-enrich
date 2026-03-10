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

// ─── Load project & rows ────────────────────────────────────

const projects = await sql`SELECT id, name, row_count FROM projects ORDER BY created_at DESC LIMIT 1`;
const project = projects[0];
console.log(`Project: ${project.name} (${project.row_count} rows)\n`);

// Load all rows
const allRows = await sql`SELECT id, data, row_index FROM rows WHERE project_id = ${project.id} ORDER BY row_index`;
const parsed = allRows.map(r => ({ id: r.id, rowIndex: r.row_index, ...JSON.parse(r.data) }));

// Filter: agencies with enseigne OR employees OR known brand names
const established = parsed.filter(d => {
  const hasEnseigne = d.enseigne1Etablissement && d.enseigne1Etablissement.trim() !== "" && d.enseigne1Etablissement !== "[ND]";
  const hasEmployees = d.trancheEffectifsEtablissement !== "NN" && d.trancheEffectifsEtablissement !== "";
  // Skip indivisions (personal holdings, not real agencies)
  const isIndivision = d.nom_entreprise.startsWith("INDIVISION ") || d.categorieJuridiqueUniteLegale === "2110";
  return !isIndivision && (hasEnseigne || hasEmployees);
});

// Deduplicate by company name (keep first)
const seen = new Set();
const unique = established.filter(d => {
  const key = d.nom_entreprise.toLowerCase().trim();
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

console.log(`Filtered: ${unique.length} unique established agencies (from ${parsed.length} total)\n`);

// ─── Enrichment ─────────────────────────────────────────────

const results = [];
const now = Date.now();

for (let i = 0; i < unique.length; i++) {
  const agency = unique[i];
  const name = agency.nom_entreprise;
  const city = agency.ville;
  console.log(`\n[${i + 1}/${unique.length}] ${name} (${city})`);

  const enrichment = {
    row_id: agency.id,
    row_index: agency.rowIndex,
    nom_entreprise: name,
    ville: city,
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
            // Pick the most generic email (contact@, info@, agence@)
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
          // Find the dirigeant: CEO, President, Gérant, Director, Founder, Owner
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
            // Fallback: take the first employee
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

  // Save to DB as enrichment results
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

  // Small delay to be nice to the API
  await new Promise(r => setTimeout(r, 500));
}

// ─── Summary ────────────────────────────────────────────────

console.log("\n\n═══ RÉSUMÉ ═══");
const withDomain = results.filter(r => r.domain);
const withEmail = results.filter(r => r.email_generique);
const withPhone = results.filter(r => r.telephone);
const withDirigeant = results.filter(r => r.dirigeant_nom);
const withDirigeantEmail = results.filter(r => r.dirigeant_email);

console.log(`Total agences traitées: ${results.length}`);
console.log(`Domaine trouvé: ${withDomain.length}`);
console.log(`Email générique: ${withEmail.length}`);
console.log(`Téléphone: ${withPhone.length}`);
console.log(`Dirigeant identifié: ${withDirigeant.length}`);
console.log(`Email dirigeant: ${withDirigeantEmail.length}`);

// Update project status
await sql`UPDATE projects SET status = 'completed', updated_at = ${now} WHERE id = ${project.id}`;
console.log("\n✓ Enrichissement terminé !");
