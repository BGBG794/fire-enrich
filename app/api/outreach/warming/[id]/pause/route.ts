import { NextResponse } from "next/server";
import { getWarmingAccount, updateWarmingAccount } from "@/lib/db/outreach-queries";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getWarmingAccount(id);
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await updateWarmingAccount(id, {
    status: "paused",
    pausedAt: Date.now(),
  });

  return NextResponse.json({ success: true });
}
