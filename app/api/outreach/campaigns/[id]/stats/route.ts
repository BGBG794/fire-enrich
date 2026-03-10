import { NextRequest, NextResponse } from "next/server";
import { getCampaign, updateCampaignStats } from "@/lib/db/outreach-queries";
import { OutreachExecutor } from "@/lib/outreach/outreach-executor";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const campaign = getCampaign(id);
  if (!campaign) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const executor = new OutreachExecutor();
  const stats = executor.computeStats(id);
  updateCampaignStats(id, stats);

  return NextResponse.json(stats);
}
