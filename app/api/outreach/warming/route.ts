import { NextResponse } from "next/server";
import { getWarmingAccounts, createWarmingAccount } from "@/lib/db/outreach-queries";

export async function GET() {
  const accounts = await getWarmingAccounts();
  return NextResponse.json(accounts);
}

export async function POST(req: Request) {
  const body = await req.json();
  const account = await createWarmingAccount({
    email: body.email,
    name: body.name,
    backend: body.backend || "smtp",
    smtp: body.smtp,
    status: "idle",
    dailyTarget: body.dailyTarget || 50,
    totalDays: body.totalDays || 28,
  });
  return NextResponse.json(account);
}
