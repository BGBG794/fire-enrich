import { NextRequest, NextResponse } from "next/server";
import {
  getSequence,
  updateSequence,
  deleteSequence,
} from "@/lib/db/outreach-queries";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sequence = getSequence(id);
  if (!sequence) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(sequence);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  updateSequence(id, body.name, body.steps);
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  deleteSequence(id);
  return NextResponse.json({ success: true });
}
