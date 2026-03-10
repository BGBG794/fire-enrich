import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/lib/db/queries";
import { getEmailTemplate } from "@/lib/db/outreach-queries";
import { TemplateResolver } from "@/lib/outreach/template-resolver";
import type { EnrichmentResult } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { projectId, templateId, rowIndex } = body;

  if (!projectId || !templateId || rowIndex === undefined) {
    return NextResponse.json(
      { error: "projectId, templateId, rowIndex required" },
      { status: 400 },
    );
  }

  const project = await getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const template = await getEmailTemplate(templateId);
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const row = project.rows.find((r) => r.rowIndex === rowIndex);
  if (!row) {
    return NextResponse.json({ error: "Row not found" }, { status: 404 });
  }

  // Build enrichments for this row
  const enrichments: Record<string, EnrichmentResult> = {};
  for (const result of project.results) {
    if (result.rowId === row.id && result.fieldName !== "_status") {
      enrichments[result.fieldName] = {
        field: result.fieldName,
        value: result.value,
        confidence: result.confidence ?? 0,
        source: result.source ?? undefined,
        sourceContext: result.sourceContext,
      };
    }
  }

  const subject = TemplateResolver.resolveTemplate(
    template.subject,
    row.data,
    enrichments,
  );
  const bodyHtml = TemplateResolver.resolveTemplate(
    template.body,
    row.data,
    enrichments,
  );

  return NextResponse.json({ subject, body: bodyHtml });
}
