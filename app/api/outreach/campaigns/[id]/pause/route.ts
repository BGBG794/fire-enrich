import { NextRequest, NextResponse } from "next/server";
import { getCampaign, updateCampaignStatus } from "@/lib/db/outreach-queries";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const campaign = getCampaign(id);
  if (!campaign) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (campaign.status !== "running") {
    return NextResponse.json(
      { error: "Can only pause running campaigns" },
      { status: 400 },
    );
  }

  updateCampaignStatus(id, "paused");
  return NextResponse.json({ success: true });
}
