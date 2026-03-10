import { NextResponse } from "next/server";
import { createProject, listProjects } from "@/lib/db/queries";

export async function GET() {
  const projects = listProjects();
  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name, columns, rows } = body;

  if (!columns || !rows || !Array.isArray(rows)) {
    return NextResponse.json({ error: "Missing columns or rows" }, { status: 400 });
  }

  const projectName = name || `Import ${new Date().toLocaleDateString()}`;
  const projectId = createProject(projectName, columns, rows);

  return NextResponse.json({ projectId });
}
