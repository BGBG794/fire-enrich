import { NextRequest, NextResponse } from "next/server";
import {
  createSequence,
  getSequences,
} from "@/lib/db/outreach-queries";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const sequences = await getSequences(projectId);
  return NextResponse.json(sequences);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { projectId, name, steps } = body;

  if (!projectId || !name || !steps) {
    return NextResponse.json(
      { error: "projectId, name, steps required" },
      { status: 400 },
    );
  }

  const id = await createSequence(projectId, name, steps);
  return NextResponse.json({ id });
}
