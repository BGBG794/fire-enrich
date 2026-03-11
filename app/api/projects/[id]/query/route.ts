import { NextRequest, NextResponse } from "next/server";
import { executeProjectQuery, listProjects } from "@/lib/db/queries";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { query } = body;

  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "query string required" }, { status: 400 });
  }

  try {
    // Get project columns
    const projects = await listProjects();
    const project = projects.find(p => p.id === id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const result = await executeProjectQuery(id, query, project.columns);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
