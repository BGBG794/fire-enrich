import { neon } from "@neondatabase/serverless";
const sql = neon("postgresql://neondb_owner:npg_UX7nexR1yaIN@ep-old-haze-ad6yyf9d-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require");

const rows = await sql`SELECT data, row_index FROM rows WHERE project_id = '3ywbvo66AmcaQubpRS9lg'`;
const parsed = rows.map(r => ({ ...JSON.parse(r.data), row_index: r.row_index }));

// Agencies with employees
const withEmployees = parsed.filter(d => d.trancheEffectifsEtablissement !== "NN" && d.trancheEffectifsEtablissement !== "");
console.log(`Agences avec employés: ${withEmployees.length}/${parsed.length}`);
withEmployees.slice(0, 20).forEach(d => {
  console.log(`  [${d.row_index}] ${d.nom_entreprise} | ${d.ville} | eff: ${d.trancheEffectifsEtablissement} | enseigne: ${d.enseigne1Etablissement || "-"}`);
});

// Agencies with enseigne (brand name = real agency)
const withEnseigne = parsed.filter(d => d.enseigne1Etablissement && d.enseigne1Etablissement.trim() !== "");
console.log(`\nAgences avec enseigne: ${withEnseigne.length}`);
withEnseigne.slice(0, 15).forEach(d => {
  console.log(`  [${d.row_index}] ${d.nom_entreprise} | enseigne: ${d.enseigne1Etablissement} | ${d.ville}`);
});
