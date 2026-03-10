import { NextRequest, NextResponse } from "next/server";
import {
  getOutreachSettings,
  saveOutreachSettings,
} from "@/lib/db/outreach-queries";
import { BillionMailService } from "@/lib/services/billionmail";
import { SMTPService } from "@/lib/services/smtp";

export async function GET() {
  const settings = await getOutreachSettings();
  return NextResponse.json(settings ?? {
    defaultBackend: "smtp",
    dailySendLimit: 200,
  });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  await saveOutreachSettings(body);
  return NextResponse.json({ success: true });
}

export async function POST(request: NextRequest) {
  // Test connection
  const body = await request.json();
  const { backend, smtp, billionmail } = body;

  try {
    if (backend === "billionmail" && billionmail) {
      const service = new BillionMailService(billionmail);
      const ok = await service.ping();
      return NextResponse.json({ success: ok, message: ok ? "Connected to BillionMail" : "Failed to connect" });
    } else if (backend === "smtp" && smtp) {
      const service = new SMTPService(smtp);
      const ok = await service.verify();
      return NextResponse.json({ success: ok, message: ok ? "SMTP connection verified" : "SMTP connection failed" });
    }

    return NextResponse.json({ success: false, message: "No backend config provided" });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : "Connection test failed",
    });
  }
}
