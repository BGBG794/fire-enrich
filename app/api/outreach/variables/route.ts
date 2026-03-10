import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/lib/db/queries";
import { TemplateResolver } from "@/lib/outreach/template-resolver";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const project = await getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Get unique enrichment field names
  const enrichmentFieldNames = [
    ...new Set(
      project.results
        .filter((r) => r.fieldName !== "_status")
        .map((r) => r.fieldName),
    ),
  ];

  // Get AI column names
  const aiColumnNames = project.aiColumns.map((c) => c.name);

  const variables = TemplateResolver.getAvailableVariables(
    project.columns,
    enrichmentFieldNames,
    aiColumnNames,
  );

  return NextResponse.json(variables);
}
