import { NextRequest, NextResponse } from "next/server";
import {
  createCampaign,
  getCampaigns,
  getAllCampaigns,
} from "@/lib/db/outreach-queries";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");

  const campaigns = projectId ? await getCampaigns(projectId) : await getAllCampaigns();
  return NextResponse.json(campaigns);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    projectId,
    name,
    sequenceId,
    sendingBackend,
    senderEmail,
    senderName,
    replyToEmail,
    rowFilter,
  } = body;

  if (!projectId || !name || !sequenceId || !senderEmail || !senderName) {
    return NextResponse.json(
      { error: "projectId, name, sequenceId, senderEmail, senderName required" },
      { status: 400 },
    );
  }

  const id = await createCampaign({
    projectId,
    name,
    sequenceId,
    sendingBackend: sendingBackend || "smtp",
    senderEmail,
    senderName,
    replyToEmail,
    status: "draft",
    rowFilter,
  });

  return NextResponse.json({ id });
}
