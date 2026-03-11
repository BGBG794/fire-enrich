import { NextRequest, NextResponse } from "next/server";
import { addRowsToProject, deleteRowsBySourceId, getProjectSources } from "@/lib/db/queries";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sources = await getProjectSources(id);
  return NextResponse.json({ sources });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { rows, columns } = body;

  if (!rows || !Array.isArray(rows)) {
    return NextResponse.json({ error: "rows array required" }, { status: 400 });
  }

  const result = await addRowsToProject(id, rows, columns);
  return NextResponse.json(result);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { sourceId } = body;

  if (!sourceId) {
    return NextResponse.json({ error: "sourceId required" }, { status: 400 });
  }

  const deleted = await deleteRowsBySourceId(id, sourceId);
  return NextResponse.json({ deleted });
}
