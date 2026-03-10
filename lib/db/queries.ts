import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema, ensureTables } from "./index";
import type { CSVRow, EnrichmentField, EnrichmentResult, PipelineConfig } from "../types";

// ─── Projects ────────────────────────────────────────────────

export async function createProject(name: string, columns: string[], csvRows: CSVRow[]) {
  await ensureTables();
  const now = Date.now();
  const projectId = nanoid();

  await db.insert(schema.projects).values({
    id: projectId,
    name,
    createdAt: now,
    updatedAt: now,
    columns: JSON.stringify(columns),
    status: "draft",
    rowCount: csvRows.length,
  });

  for (let i = 0; i < csvRows.length; i++) {
    await db.insert(schema.rows).values({
      id: nanoid(),
      projectId,
      rowIndex: i,
      data: JSON.stringify(csvRows[i]),
    });
  }

  return projectId;
}

export async function listProjects() {
  await ensureTables();
  const results = await db
    .select()
    .from(schema.projects)
    .orderBy(schema.projects.createdAt);

  return results
    .reverse()
    .map((p) => ({
      ...p,
      columns: JSON.parse(p.columns) as string[],
    }));
}

export async function getProject(id: string) {
  await ensureTables();
  const projectResults = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id));

  const project = projectResults[0];
  if (!project) return null;

  const projectRows = (await db
    .select()
    .from(schema.rows)
    .where(eq(schema.rows.projectId, id))
    .orderBy(schema.rows.rowIndex))
    .map((r) => ({
      ...r,
      data: JSON.parse(r.data) as CSVRow,
    }));

  const fields = await db
    .select()
    .from(schema.enrichmentFields)
    .where(eq(schema.enrichmentFields.projectId, id));

  const results = (await db
    .select()
    .from(schema.enrichmentResults)
    .where(eq(schema.enrichmentResults.projectId, id)))
    .map((r) => ({
      ...r,
      value: r.value ? JSON.parse(r.value) : null,
      sourceContext: r.sourceContext ? JSON.parse(r.sourceContext) : undefined,
    }));

  const aiCols = await db
    .select()
    .from(schema.aiColumns)
    .where(eq(schema.aiColumns.projectId, id));

  const aiResults = (await db
    .select()
    .from(schema.aiColumnResults)
    .where(eq(schema.aiColumnResults.projectId, id)))
    .map((r) => ({
      ...r,
      value: r.value ? JSON.parse(r.value) : null,
    }));

  return {
    ...project,
    columns: JSON.parse(project.columns) as string[],
    rows: projectRows,
    fields,
    results,
    aiColumns: aiCols,
    aiColumnResults: aiResults,
  };
}

export async function deleteProject(id: string) {
  await ensureTables();
  await db.delete(schema.projects).where(eq(schema.projects.id, id));
}

// ─── Fields ──────────────────────────────────────────────────

export async function saveFields(projectId: string, emailColumn: string, fields: EnrichmentField[]) {
  await ensureTables();
  const now = Date.now();

  await db.update(schema.projects)
    .set({ emailColumn, updatedAt: now, status: "enriching" })
    .where(eq(schema.projects.id, projectId));

  await db.delete(schema.enrichmentFields)
    .where(eq(schema.enrichmentFields.projectId, projectId));

  for (const field of fields) {
    await db.insert(schema.enrichmentFields).values({
      id: nanoid(),
      projectId,
      name: field.name,
      displayName: field.displayName,
      description: field.description,
      type: field.type,
      required: field.required ? 1 : 0,
    });
  }
}

// ─── Enrichment Results ──────────────────────────────────────

export async function saveEnrichmentResult(
  projectId: string,
  rowIndex: number,
  enrichments: Record<string, EnrichmentResult>,
  status: string,
  error?: string,
) {
  await ensureTables();
  const now = Date.now();

  const allRows = await db
    .select()
    .from(schema.rows)
    .where(eq(schema.rows.projectId, projectId));

  const row = allRows.find((r) => r.rowIndex === rowIndex);
  if (!row) return;

  await db.delete(schema.enrichmentResults)
    .where(eq(schema.enrichmentResults.rowId, row.id));

  if (status === "skipped" || status === "error") {
    await db.insert(schema.enrichmentResults).values({
      id: nanoid(),
      projectId,
      rowId: row.id,
      fieldName: "_status",
      status,
      error: error || null,
      createdAt: now,
    });
    return;
  }

  for (const [fieldName, result] of Object.entries(enrichments)) {
    await db.insert(schema.enrichmentResults).values({
      id: nanoid(),
      projectId,
      rowId: row.id,
      fieldName,
      value: JSON.stringify(result.value),
      confidence: result.confidence,
      source: result.source || null,
      sourceContext: result.sourceContext ? JSON.stringify(result.sourceContext) : null,
      status: "completed",
      createdAt: now,
    });
  }
}

export async function updateProjectStatus(projectId: string, status: string) {
  await ensureTables();
  await db.update(schema.projects)
    .set({ status, updatedAt: Date.now() })
    .where(eq(schema.projects.id, projectId));
}

// ─── AI Columns ─────────────────────────────────────────────

export async function createAIColumn(
  projectId: string,
  name: string,
  displayName: string,
  prompt: string,
  type: string = "string",
) {
  await ensureTables();
  const id = nanoid();
  const now = Date.now();

  await db.insert(schema.aiColumns).values({
    id,
    projectId,
    name,
    displayName,
    prompt,
    type,
    createdAt: now,
  });

  return id;
}

export async function getAIColumns(projectId: string) {
  await ensureTables();
  return db
    .select()
    .from(schema.aiColumns)
    .where(eq(schema.aiColumns.projectId, projectId));
}

export async function deleteAIColumn(columnId: string) {
  await ensureTables();
  await db.delete(schema.aiColumns).where(eq(schema.aiColumns.id, columnId));
}

export async function saveAIColumnResult(
  projectId: string,
  columnId: string,
  rowId: string,
  value: string | number | boolean | null,
  status: string,
  error?: string,
) {
  await ensureTables();
  const now = Date.now();

  const existing = (await db
    .select()
    .from(schema.aiColumnResults)
    .where(eq(schema.aiColumnResults.columnId, columnId)))
    .find((r) => r.rowId === rowId);

  if (existing) {
    await db.delete(schema.aiColumnResults)
      .where(eq(schema.aiColumnResults.id, existing.id));
  }

  await db.insert(schema.aiColumnResults).values({
    id: nanoid(),
    projectId,
    columnId,
    rowId,
    value: value !== null ? JSON.stringify(value) : null,
    status,
    error: error || null,
    createdAt: now,
  });
}

export async function getAIColumnResults(projectId: string) {
  await ensureTables();
  return (await db
    .select()
    .from(schema.aiColumnResults)
    .where(eq(schema.aiColumnResults.projectId, projectId)))
    .map((r) => ({
      ...r,
      value: r.value ? JSON.parse(r.value) : null,
    }));
}

// ─── Pipeline ────────────────────────────────────────────────

export async function savePipelineConfig(projectId: string, pipelineConfig: PipelineConfig) {
  await ensureTables();
  const now = Date.now();
  await db.update(schema.projects)
    .set({
      pipelineConfig: JSON.stringify(pipelineConfig),
      mode: "pipeline",
      updatedAt: now,
      status: "enriching",
    })
    .where(eq(schema.projects.id, projectId));
}

// ─── Row lookup helper ───────────────────────────────────────

export async function getRowIdByIndex(projectId: string, rowIndex: number): Promise<string | null> {
  await ensureTables();
  const allRows = await db
    .select()
    .from(schema.rows)
    .where(eq(schema.rows.projectId, projectId));

  const match = allRows.find((r) => r.rowIndex === rowIndex);
  return match?.id ?? null;
}
