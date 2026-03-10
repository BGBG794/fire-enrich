import { NextRequest, NextResponse } from "next/server";
import {
  createEmailTemplate,
  getEmailTemplates,
} from "@/lib/db/outreach-queries";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const templates = await getEmailTemplates(projectId);
  return NextResponse.json(templates);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { projectId, name, subject, body: emailBody } = body;

  if (!projectId || !name || !subject || !emailBody) {
    return NextResponse.json(
      { error: "projectId, name, subject, body required" },
      { status: 400 },
    );
  }

  const id = await createEmailTemplate(projectId, name, subject, emailBody);
  return NextResponse.json({ id });
}
