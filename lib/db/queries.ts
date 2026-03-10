import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "./index";
import type { CSVRow, EnrichmentField, EnrichmentResult, PipelineConfig } from "../types";

// ─── Projects ────────────────────────────────────────────────

export function createProject(name: string, columns: string[], csvRows: CSVRow[]) {
  const now = Date.now();
  const projectId = nanoid();

  db.insert(schema.projects).values({
    id: projectId,
    name,
    createdAt: now,
    updatedAt: now,
    columns: JSON.stringify(columns),
    status: "draft",
    rowCount: csvRows.length,
  }).run();

  // Insert rows in a transaction for performance
  const insertRow = db.insert(schema.rows);
  for (let i = 0; i < csvRows.length; i++) {
    insertRow.values({
      id: nanoid(),
      projectId,
      rowIndex: i,
      data: JSON.stringify(csvRows[i]),
    }).run();
  }

  return projectId;
}

export function listProjects() {
  return db
    .select()
    .from(schema.projects)
    .orderBy(schema.projects.createdAt)
    .all()
    .reverse() // Most recent first
    .map((p) => ({
      ...p,
      columns: JSON.parse(p.columns) as string[],
    }));
}

export function getProject(id: string) {
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .get();

  if (!project) return null;

  const projectRows = db
    .select()
    .from(schema.rows)
    .where(eq(schema.rows.projectId, id))
    .orderBy(schema.rows.rowIndex)
    .all()
    .map((r) => ({
      ...r,
      data: JSON.parse(r.data) as CSVRow,
    }));

  const fields = db
    .select()
    .from(schema.enrichmentFields)
    .where(eq(schema.enrichmentFields.projectId, id))
    .all();

  const results = db
    .select()
    .from(schema.enrichmentResults)
    .where(eq(schema.enrichmentResults.projectId, id))
    .all()
    .map((r) => ({
      ...r,
      value: r.value ? JSON.parse(r.value) : null,
      sourceContext: r.sourceContext ? JSON.parse(r.sourceContext) : undefined,
    }));

  const aiCols = db
    .select()
    .from(schema.aiColumns)
    .where(eq(schema.aiColumns.projectId, id))
    .all();

  const aiResults = db
    .select()
    .from(schema.aiColumnResults)
    .where(eq(schema.aiColumnResults.projectId, id))
    .all()
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

export function deleteProject(id: string) {
  db.delete(schema.projects).where(eq(schema.projects.id, id)).run();
}

// ─── Fields ──────────────────────────────────────────────────

export function saveFields(projectId: string, emailColumn: string, fields: EnrichmentField[]) {
  const now = Date.now();

  // Update project
  db.update(schema.projects)
    .set({ emailColumn, updatedAt: now, status: "enriching" })
    .where(eq(schema.projects.id, projectId))
    .run();

  // Delete existing fields and re-insert
  db.delete(schema.enrichmentFields)
    .where(eq(schema.enrichmentFields.projectId, projectId))
    .run();

  for (const field of fields) {
    db.insert(schema.enrichmentFields).values({
      id: nanoid(),
      projectId,
      name: field.name,
      displayName: field.displayName,
      description: field.description,
      type: field.type,
      required: field.required ? 1 : 0,
    }).run();
  }
}

// ─── Enrichment Results ──────────────────────────────────────

export function saveEnrichmentResult(
  projectId: string,
  rowIndex: number,
  enrichments: Record<string, EnrichmentResult>,
  status: string,
  error?: string,
) {
  const now = Date.now();

  // Find the row by projectId + rowIndex
  const row = db
    .select()
    .from(schema.rows)
    .where(eq(schema.rows.projectId, projectId))
    .all()
    .find((r) => r.rowIndex === rowIndex);

  if (!row) return;

  // Delete existing results for this row (in case of retry)
  db.delete(schema.enrichmentResults)
    .where(eq(schema.enrichmentResults.rowId, row.id))
    .run();

  if (status === "skipped" || status === "error") {
    // Insert a single result marking the status
    db.insert(schema.enrichmentResults).values({
      id: nanoid(),
      projectId,
      rowId: row.id,
      fieldName: "_status",
      status,
      error: error || null,
      createdAt: now,
    }).run();
    return;
  }

  // Insert each enrichment field result
  for (const [fieldName, result] of Object.entries(enrichments)) {
    db.insert(schema.enrichmentResults).values({
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
    }).run();
  }
}

export function updateProjectStatus(projectId: string, status: string) {
  db.update(schema.projects)
    .set({ status, updatedAt: Date.now() })
    .where(eq(schema.projects.id, projectId))
    .run();
}

// ─── AI Columns ─────────────────────────────────────────────

export function createAIColumn(
  projectId: string,
  name: string,
  displayName: string,
  prompt: string,
  type: string = "string",
) {
  const id = nanoid();
  const now = Date.now();

  db.insert(schema.aiColumns).values({
    id,
    projectId,
    name,
    displayName,
    prompt,
    type,
    createdAt: now,
  }).run();

  return id;
}

export function getAIColumns(projectId: string) {
  return db
    .select()
    .from(schema.aiColumns)
    .where(eq(schema.aiColumns.projectId, projectId))
    .all();
}

export function deleteAIColumn(columnId: string) {
  db.delete(schema.aiColumns).where(eq(schema.aiColumns.id, columnId)).run();
}

export function saveAIColumnResult(
  projectId: string,
  columnId: string,
  rowId: string,
  value: string | number | boolean | null,
  status: string,
  error?: string,
) {
  const now = Date.now();

  // Upsert: delete existing result for this column+row, then insert
  const existing = db
    .select()
    .from(schema.aiColumnResults)
    .where(eq(schema.aiColumnResults.columnId, columnId))
    .all()
    .find((r) => r.rowId === rowId);

  if (existing) {
    db.delete(schema.aiColumnResults)
      .where(eq(schema.aiColumnResults.id, existing.id))
      .run();
  }

  db.insert(schema.aiColumnResults).values({
    id: nanoid(),
    projectId,
    columnId,
    rowId,
    value: value !== null ? JSON.stringify(value) : null,
    status,
    error: error || null,
    createdAt: now,
  }).run();
}

export function getAIColumnResults(projectId: string) {
  return db
    .select()
    .from(schema.aiColumnResults)
    .where(eq(schema.aiColumnResults.projectId, projectId))
    .all()
    .map((r) => ({
      ...r,
      value: r.value ? JSON.parse(r.value) : null,
    }));
}

// ─── Pipeline ────────────────────────────────────────────────

export function savePipelineConfig(projectId: string, pipelineConfig: PipelineConfig) {
  const now = Date.now();
  db.update(schema.projects)
    .set({
      pipelineConfig: JSON.stringify(pipelineConfig),
      mode: "pipeline",
      updatedAt: now,
      status: "enriching",
    })
    .where(eq(schema.projects.id, projectId))
    .run();
}

// ─── Row lookup helper ───────────────────────────────────────

export function getRowIdByIndex(projectId: string, rowIndex: number): string | null {
  const row = db
    .select({ id: schema.rows.id })
    .from(schema.rows)
    .where(eq(schema.rows.projectId, projectId))
    .all()
    .find((r) => r.id); // we need to filter by rowIndex too

  // More precise query
  const rows = db
    .select()
    .from(schema.rows)
    .where(eq(schema.rows.projectId, projectId))
    .all();

  const match = rows.find((r) => r.rowIndex === rowIndex);
  return match?.id ?? null;
}
