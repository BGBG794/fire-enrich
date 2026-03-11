import { NextResponse } from "next/server";
import { createProject, createEmptyProject, listProjects } from "@/lib/db/queries";

export async function GET() {
  const projects = await listProjects();
  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name, columns, rows: csvRows } = body;

  const projectName = name || `Import ${new Date().toLocaleDateString()}`;

  // Support empty project creation
  if (!csvRows || csvRows.length === 0) {
    const projectId = await createEmptyProject(projectName);
    return NextResponse.json({ projectId });
  }

  if (!columns || !Array.isArray(csvRows)) {
    return NextResponse.json({ error: "Missing columns or rows" }, { status: 400 });
  }

  const projectId = await createProject(projectName, columns, csvRows);

  return NextResponse.json({ projectId });
}
