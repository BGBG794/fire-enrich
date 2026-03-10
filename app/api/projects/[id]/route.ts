import { NextResponse } from "next/server";
import { getProject, deleteProject, saveFields, updateProjectStatus, savePipelineConfig } from "@/lib/db/queries";
import type { EnrichmentField, PipelineConfig } from "@/lib/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({ project });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();

  if (body.emailColumn && body.fields) {
    saveFields(id, body.emailColumn, body.fields as EnrichmentField[]);
  }

  if (body.pipelineConfig) {
    savePipelineConfig(id, body.pipelineConfig as PipelineConfig);
  }

  if (body.status) {
    updateProjectStatus(id, body.status);
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  deleteProject(id);
  return NextResponse.json({ success: true });
}
