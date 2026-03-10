import { NextRequest, NextResponse } from "next/server";
import {
  getCampaign,
  deleteCampaign,
} from "@/lib/db/outreach-queries";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(campaign);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await deleteCampaign(id);
  return NextResponse.json({ success: true });
}
