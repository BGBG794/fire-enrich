import { NextResponse } from "next/server";
import { getWarmingAccount, updateWarmingAccount } from "@/lib/db/outreach-queries";
import { warmingEngine } from "@/lib/outreach/warming-engine";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getWarmingAccount(id);
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await updateWarmingAccount(id, {
    status: "warming",
    startedAt: Date.now(),
    currentDay: 0,
    emailsSentToday: 0,
  });

  // Ensure engine is running
  warmingEngine.start();

  return NextResponse.json({ success: true });
}
