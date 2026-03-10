import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  createAIColumn,
  getAIColumns,
  deleteAIColumn,
  saveAIColumnResult,
} from "@/lib/db/queries";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

// GET: List AI columns for a project
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }
  const columns = await getAIColumns(projectId);
  return NextResponse.json({ columns });
}

// POST: Create an AI column and run it on all rows (SSE stream)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, displayName, prompt, type = "string" } = body;

    if (!projectId || !displayName || !prompt) {
      return NextResponse.json(
        { error: "projectId, displayName, and prompt are required" },
        { status: 400 },
      );
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 },
      );
    }

    // Generate a slug name from displayName
    const name = displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");

    // Create the AI column in DB
    const columnId = await createAIColumn(projectId, name, displayName, prompt, type);

    // Load rows with their enrichment data
    const projectRows = await db
      .select()
      .from(schema.rows)
      .where(eq(schema.rows.projectId, projectId))
      .orderBy(schema.rows.rowIndex);

    const enrichmentResults = await db
      .select()
      .from(schema.enrichmentResults)
      .where(eq(schema.enrichmentResults.projectId, projectId));

    // Group enrichment results by rowId
    const resultsByRowId = new Map<string, Record<string, any>>();
    for (const r of enrichmentResults) {
      if (r.fieldName === "_status") continue;
      if (!resultsByRowId.has(r.rowId)) {
        resultsByRowId.set(r.rowId, {});
      }
      const map = resultsByRowId.get(r.rowId)!;
      map[r.fieldName] = r.value ? JSON.parse(r.value) : null;
    }

    const openai = new OpenAI({ apiKey: openaiApiKey });
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send column metadata
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "column", columnId, name, displayName, columnType: type })}\n\n`,
            ),
          );

          // Process each row
          const concurrency = 3;
          let currentIndex = 0;
          const activePromises: Promise<void>[] = [];

          const processRow = async (row: typeof projectRows[0]) => {
            const rowData = JSON.parse(row.data);
            const enrichedData = resultsByRowId.get(row.id) || {};

            // Build context string for the AI
            const contextParts: string[] = [];
            for (const [key, value] of Object.entries(rowData)) {
              if (value) contextParts.push(`${key}: ${value}`);
            }
            for (const [key, value] of Object.entries(enrichedData)) {
              if (value !== null && value !== undefined) {
                contextParts.push(
                  `${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`,
                );
              }
            }

            const contextStr = contextParts.join("\n");

            const systemPrompt = `You are a data analyst processing rows of enriched company/contact data. For each row, you will be given the original CSV data plus any enriched fields. Your job is to answer the user's question about this specific row.

IMPORTANT: Respond with ONLY the answer value, nothing else. No explanations, no labels, no quotes.
${type === "boolean" ? "Answer exactly 'true' or 'false'." : ""}
${type === "number" ? "Answer with a number only." : ""}`;

            try {
              const completion = await openai.chat.completions.create({
                model: "gpt-5-mini",
                messages: [
                  { role: "system", content: systemPrompt },
                  {
                    role: "user",
                    content: `Row data:\n${contextStr}\n\nQuestion: ${prompt}`,
                  },
                ],
                max_completion_tokens: 500,
              });

              const rawValue =
                completion.choices[0]?.message?.content?.trim() || "";

              // Parse value based on type
              let parsedValue: string | number | boolean = rawValue;
              if (type === "boolean") {
                parsedValue =
                  rawValue.toLowerCase() === "true" ||
                  rawValue.toLowerCase() === "yes";
              } else if (type === "number") {
                const num = parseFloat(rawValue);
                parsedValue = isNaN(num) ? 0 : num;
              }

              // Save to DB
              await saveAIColumnResult(
                projectId,
                columnId,
                row.id,
                parsedValue,
                "completed",
              );

              // Stream result
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "result",
                    rowIndex: row.rowIndex,
                    rowId: row.id,
                    columnId,
                    value: parsedValue,
                    status: "completed",
                  })}\n\n`,
                ),
              );
            } catch (err) {
              const errorMsg =
                err instanceof Error ? err.message : "Unknown error";
              await saveAIColumnResult(
                projectId,
                columnId,
                row.id,
                null,
                "error",
                errorMsg,
              );

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "result",
                    rowIndex: row.rowIndex,
                    rowId: row.id,
                    columnId,
                    value: null,
                    status: "error",
                    error: errorMsg,
                  })}\n\n`,
                ),
              );
            }
          };

          while (
            currentIndex < projectRows.length ||
            activePromises.length > 0
          ) {
            while (
              currentIndex < projectRows.length &&
              activePromises.length < concurrency
            ) {
              const row = projectRows[currentIndex++];
              const promise = processRow(row).then(() => {
                const idx = activePromises.indexOf(promise);
                if (idx > -1) activePromises.splice(idx, 1);
              });
              activePromises.push(promise);
            }

            if (activePromises.length > 0) {
              await Promise.race(activePromises);
            }
          }

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "complete", columnId })}\n\n`,
            ),
          );
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error:
                  error instanceof Error ? error.message : "Unknown error",
              })}\n\n`,
            ),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("AI Column error:", error);
    return NextResponse.json(
      { error: "Failed to create AI column" },
      { status: 500 },
    );
  }
}

// DELETE: Remove an AI column
export async function DELETE(request: NextRequest) {
  const columnId = request.nextUrl.searchParams.get("columnId");
  if (!columnId) {
    return NextResponse.json(
      { error: "columnId required" },
      { status: 400 },
    );
  }
  await deleteAIColumn(columnId);
  return NextResponse.json({ success: true });
}
