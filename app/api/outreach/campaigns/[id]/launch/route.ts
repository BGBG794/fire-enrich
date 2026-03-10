import { NextRequest, NextResponse } from "next/server";
import {
  getCampaign,
  getSequence,
  updateCampaignStatus,
  updateCampaignStats,
  getOutreachSettings,
} from "@/lib/db/outreach-queries";
import { getProject } from "@/lib/db/queries";
import { OutreachExecutor } from "@/lib/outreach/outreach-executor";
import type { RecipientData } from "@/lib/outreach/outreach-executor";
import { BillionMailService } from "@/lib/services/billionmail";
import { SMTPService } from "@/lib/services/smtp";
import type { EnrichmentResult } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const campaign = getCampaign(id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (campaign.status !== "draft") {
    return NextResponse.json(
      { error: "Campaign must be in draft status to launch" },
      { status: 400 },
    );
  }

  const sequence = getSequence(campaign.sequenceId);
  if (!sequence) {
    return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
  }

  const project = getProject(campaign.projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Build recipients from enrichment data
  const recipients: RecipientData[] = [];
  const emailFieldName = campaign.rowFilter?.emailFieldName;

  for (const row of project.rows) {
    // Filter by checked rows if specified
    if (
      campaign.rowFilter?.checkedRowIndices &&
      !campaign.rowFilter.checkedRowIndices.includes(row.rowIndex)
    ) {
      continue;
    }

    // Build enrichments map for this row
    const enrichments: Record<string, EnrichmentResult> = {};
    for (const result of project.results) {
      if (result.rowId === row.id && result.fieldName !== "_status") {
        enrichments[result.fieldName] = {
          field: result.fieldName,
          value: result.value,
          confidence: result.confidence ?? 0,
          source: result.source ?? undefined,
          sourceContext: result.sourceContext,
        };
      }
    }

    // Find email
    let email: string | undefined;
    let name: string | undefined;

    if (emailFieldName && enrichments[emailFieldName]?.value) {
      email = String(enrichments[emailFieldName].value);
    }
    // Fallback: look for email in CSV data
    if (!email && project.columns.includes("email")) {
      email = row.data.email || row.data.Email;
    }

    // Try to find a name field
    const nameField = Object.keys(enrichments).find(
      (k) => k.toLowerCase().includes("name") && !k.toLowerCase().includes("company"),
    );
    if (nameField) {
      name = String(enrichments[nameField].value);
    }

    if (campaign.rowFilter?.requireEmail && !email) continue;
    if (!email) continue;

    recipients.push({
      rowId: row.id,
      email,
      name,
      rowData: row.data,
      enrichments,
    });
  }

  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "No recipients found with valid email addresses" },
      { status: 400 },
    );
  }

  // SSE streaming response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        // Build executor
        const settings = getOutreachSettings();
        const dailyLimit = settings?.dailySendLimit ?? 200;

        let billionmail: BillionMailService | undefined;
        let smtp: SMTPService | undefined;

        if (campaign.sendingBackend === "billionmail" && settings?.billionmail) {
          billionmail = new BillionMailService(settings.billionmail);
        }
        if (settings?.smtp) {
          smtp = new SMTPService(settings.smtp);
        }
        // If no backend configured, also try env vars for SMTP
        if (!billionmail && !smtp) {
          const host = process.env.SMTP_HOST;
          const port = process.env.SMTP_PORT;
          const user = process.env.SMTP_USERNAME;
          const pass = process.env.SMTP_PASSWORD;
          if (host && port && user && pass) {
            smtp = new SMTPService({
              host,
              port: parseInt(port),
              secure: process.env.SMTP_SECURE === "true",
              username: user,
              password: pass,
            });
          }
        }

        const executor = new OutreachExecutor(billionmail, smtp);

        // Update campaign status
        updateCampaignStatus(id, "running", { startedAt: Date.now() });

        send({
          type: "started",
          campaignId: id,
          totalRecipients: recipients.length,
        });

        // Execute initial step with progress
        const result = await executor.executeInitialStep(
          { ...campaign, status: "running" },
          sequence,
          recipients,
          dailyLimit,
          (message, type) => {
            send({ type: "progress", message, messageType: type });
          },
        );

        // Update stats
        const stats = executor.computeStats(id);
        updateCampaignStats(id, stats);

        // If only 1 step, campaign is complete; otherwise scheduler handles follow-ups
        if (sequence.steps.length <= 1) {
          updateCampaignStatus(id, "completed", { completedAt: Date.now() });
        }

        send({
          type: "complete",
          sent: result.sent,
          failed: result.failed,
          stats,
        });
      } catch (error) {
        send({
          type: "error",
          error: error instanceof Error ? error.message : "Launch failed",
        });
        updateCampaignStatus(id, "draft");
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
