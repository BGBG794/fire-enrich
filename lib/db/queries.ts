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

// ─── Sandbox ─────────────────────────────────────────────────

export async function createEmptyProject(name: string) {
  await ensureTables();
  const now = Date.now();
  const projectId = nanoid();
  await db.insert(schema.projects).values({
    id: projectId,
    name,
    createdAt: now,
    updatedAt: now,
    columns: JSON.stringify([]),
    status: "draft",
    rowCount: 0,
  });
  return projectId;
}

export async function addRowsToProject(
  projectId: string,
  newRows: CSVRow[],
  newColumns?: string[]
) {
  await ensureTables();
  const now = Date.now();

  // Get current project
  const projects = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  const project = projects[0];
  if (!project) throw new Error("Project not found");

  const existingColumns = JSON.parse(project.columns) as string[];

  // Merge columns (union)
  const mergedColumns = newColumns
    ? [...new Set([...existingColumns, ...newColumns])]
    : existingColumns;

  // Get max row_index
  const allRows = await db.select({ rowIndex: schema.rows.rowIndex })
    .from(schema.rows)
    .where(eq(schema.rows.projectId, projectId));
  const maxIndex = allRows.length > 0 ? Math.max(...allRows.map(r => r.rowIndex)) : -1;

  // Insert new rows
  for (let i = 0; i < newRows.length; i++) {
    await db.insert(schema.rows).values({
      id: nanoid(),
      projectId,
      rowIndex: maxIndex + 1 + i,
      data: JSON.stringify(newRows[i]),
    });
  }

  // Update project
  const newRowCount = (project.rowCount ?? 0) + newRows.length;
  await db.update(schema.projects)
    .set({
      columns: JSON.stringify(mergedColumns),
      rowCount: newRowCount,
      updatedAt: now,
    })
    .where(eq(schema.projects.id, projectId));

  return { addedCount: newRows.length, totalRows: newRowCount };
}

export async function deleteRowsBySourceId(projectId: string, sourceId: string) {
  await ensureTables();
  const now = Date.now();

  // Fetch all rows, find ones matching sourceId
  const allRows = await db.select().from(schema.rows).where(eq(schema.rows.projectId, projectId));
  const toDelete = allRows.filter(r => {
    const data = JSON.parse(r.data);
    return data._source_id === sourceId;
  });

  for (const row of toDelete) {
    await db.delete(schema.enrichmentResults).where(eq(schema.enrichmentResults.rowId, row.id));
    await db.delete(schema.rows).where(eq(schema.rows.id, row.id));
  }

  // Update row count
  const remaining = allRows.length - toDelete.length;
  await db.update(schema.projects)
    .set({ rowCount: remaining, updatedAt: now })
    .where(eq(schema.projects.id, projectId));

  return toDelete.length;
}

export async function getProjectSources(projectId: string) {
  await ensureTables();
  const allRows = await db.select().from(schema.rows).where(eq(schema.rows.projectId, projectId));

  const sourceMap = new Map<string, { sourceName: string; sourceType: string; rowCount: number; addedAt: number }>();

  for (const row of allRows) {
    const data = JSON.parse(row.data);
    const sourceId = data._source_id || '__legacy__';
    const existing = sourceMap.get(sourceId);
    if (existing) {
      existing.rowCount++;
    } else {
      sourceMap.set(sourceId, {
        sourceName: data._source_name || 'Import initial',
        sourceType: data._source_type || 'csv',
        rowCount: 1,
        addedAt: data._source_added_at || 0,
      });
    }
  }

  return Array.from(sourceMap.entries()).map(([sourceId, info]) => ({
    sourceId,
    ...info,
  }));
}

export async function executeProjectQuery(
  projectId: string,
  query: string,
  projectColumns: string[]
) {
  await ensureTables();

  // Security: only SELECT allowed
  const normalized = query.trim().toUpperCase();
  if (!normalized.startsWith('SELECT')) {
    throw new Error('Only SELECT queries are allowed');
  }
  const forbidden = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'EXEC', 'GRANT', 'REVOKE'];
  for (const word of forbidden) {
    // Check for the word as a standalone keyword (not part of a column name)
    if (new RegExp(`\\b${word}\\b`, 'i').test(query)) {
      throw new Error(`${word} statements are not allowed`);
    }
  }

  // Build CTE with dynamic columns from project
  const columnExtracts = projectColumns
    .map(col => `r.data::jsonb ->> '${col.replace(/'/g, "''")}' as "${col.replace(/"/g, '""')}"`)
    .join(',\n    ');

  // Get enrichment field names for this project
  const enrichResults = await db.select({ fieldName: schema.enrichmentResults.fieldName })
    .from(schema.enrichmentResults)
    .where(eq(schema.enrichmentResults.projectId, projectId));

  const enrichFields = [...new Set(enrichResults.map(r => r.fieldName).filter(f => f !== '_status'))];

  const enrichExtracts = enrichFields
    .map(f => `MAX(CASE WHEN er.field_name = '${f.replace(/'/g, "''")}' THEN er.value END) as "${f.replace(/"/g, '""')}"`)
    .join(',\n    ');

  // Replace "FROM data" or "FROM project_data" in user query with "FROM project_data"
  const userQuery = query.replace(/\bFROM\s+data\b/gi, 'FROM project_data').replace(/\bFROM\s+project_data\b/gi, 'FROM project_data');

  const fullQuery = `
    WITH project_data AS (
      SELECT r.row_index,
        ${columnExtracts}${enrichExtracts ? ',\n    ' + enrichExtracts : ''}
      FROM rows r
      LEFT JOIN enrichment_results er ON er.row_id = r.id AND er.project_id = '${projectId.replace(/'/g, "''")}'
      WHERE r.project_id = '${projectId.replace(/'/g, "''")}'
      GROUP BY r.id, r.row_index, r.data
    )
    ${userQuery}
  `;

  const startTime = Date.now();
  // Use neon's .query() for plain string SQL
  const { neon } = await import("@neondatabase/serverless");
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) throw new Error("DATABASE_URL required");
  const rawSql = neon(DATABASE_URL);

  const result = await rawSql.query(fullQuery) as any;
  const executionTimeMs = Date.now() - startTime;

  // neon .query() returns the array directly
  const rows = Array.isArray(result) ? result : (result.rows || []);
  const resultColumns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return {
    columns: resultColumns,
    rows: rows as Record<string, any>[],
    rowCount: rows.length,
    executionTimeMs,
  };
}
