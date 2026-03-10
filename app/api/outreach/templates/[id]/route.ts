import { NextRequest, NextResponse } from "next/server";
import {
  getEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
} from "@/lib/db/outreach-queries";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const template = await getEmailTemplate(id);
  if (!template) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(template);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  await updateEmailTemplate(id, body);
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await deleteEmailTemplate(id);
  return NextResponse.json({ success: true });
}
