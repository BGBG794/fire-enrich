import { NextRequest, NextResponse } from "next/server";
import { getEmailSends } from "@/lib/db/outreach-queries";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const stepId = request.nextUrl.searchParams.get("step") ?? undefined;
  const sends = await getEmailSends(id, stepId);
  return NextResponse.json(sends);
}
