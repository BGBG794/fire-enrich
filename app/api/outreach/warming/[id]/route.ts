import { NextResponse } from "next/server";
import { getWarmingAccount, getWarmingLogs, updateWarmingAccount, deleteWarmingAccount } from "@/lib/db/outreach-queries";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getWarmingAccount(id);
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const logs = await getWarmingLogs(id);
  return NextResponse.json({ ...account, logs });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  await updateWarmingAccount(id, body);
  const updated = await getWarmingAccount(id);
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteWarmingAccount(id);
  return NextResponse.json({ success: true });
}
