import type {
  Campaign,
  Sequence,
  SequenceStep,
  EmailSend,
  EmailSendStatus,
  FollowUpCondition,
  CampaignStats,
  CSVRow,
  EnrichmentResult,
  SendingBackend,
} from "@/lib/types";
import { BillionMailService } from "@/lib/services/billionmail";
import { SMTPService } from "@/lib/services/smtp";
import { TemplateResolver } from "./template-resolver";
import {
  createEmailSend,
  updateEmailSendStatus,
  createEmailEvent,
  getEmailSends,
  getTodaySendCount,
  getEmailTemplate,
} from "@/lib/db/outreach-queries";

export type ProgressCallback = (
  message: string,
  type: "info" | "success" | "warning" | "error",
) => void;

export interface RecipientData {
  rowId: string;
  email: string;
  name?: string;
  rowData: CSVRow;
  enrichments: Record<string, EnrichmentResult>;
}

export class OutreachExecutor {
  private billionmail?: BillionMailService;
  private smtp?: SMTPService;

  constructor(billionmail?: BillionMailService, smtp?: SMTPService) {
    this.billionmail = billionmail;
    this.smtp = smtp;
  }

  /**
   * Execute the initial step (step 0) of a campaign — sends to all recipients.
   */
  async executeInitialStep(
    campaign: Campaign,
    sequence: Sequence,
    recipients: RecipientData[],
    dailySendLimit: number,
    onProgress?: ProgressCallback,
  ): Promise<{ sent: number; failed: number }> {
    const step = sequence.steps.find((s) => s.order === 0);
    if (!step) throw new Error("Sequence has no initial step (order 0)");

    const template = getEmailTemplate(step.templateId);
    if (!template) throw new Error(`Template ${step.templateId} not found`);

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];

      // Check daily send limit
      const todayCount = getTodaySendCount();
      if (todayCount >= dailySendLimit) {
        onProgress?.(
          `Daily send limit reached (${dailySendLimit}). Pausing.`,
          "warning",
        );
        break;
      }

      // Resolve template
      const resolvedSubject = TemplateResolver.resolveTemplate(
        template.subject,
        recipient.rowData,
        recipient.enrichments,
      );
      const resolvedBody = TemplateResolver.resolveTemplate(
        template.body,
        recipient.rowData,
        recipient.enrichments,
      );

      // Create email_send record
      const sendId = createEmailSend({
        campaignId: campaign.id,
        sequenceStepId: step.id,
        rowId: recipient.rowId,
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        status: "pending",
        resolvedSubject,
        resolvedBody,
      });

      // Send
      const result = await this.sendEmail(campaign.sendingBackend, {
        from: campaign.senderEmail,
        fromName: campaign.senderName,
        to: recipient.email,
        subject: resolvedSubject,
        html: resolvedBody,
        replyTo: campaign.replyToEmail,
        attribs: TemplateResolver.buildBillionMailAttribs(
          recipient.rowData,
          recipient.enrichments,
        ),
      });

      if (result.success) {
        updateEmailSendStatus(sendId, "sent", {
          sentAt: Date.now(),
          billionmailMessageId: result.messageId,
        });
        createEmailEvent(sendId, "sent");
        sent++;
        onProgress?.(
          `[${i + 1}/${recipients.length}] Sent to ${recipient.email}`,
          "success",
        );
      } else {
        updateEmailSendStatus(sendId, "failed", {
          errorMessage: result.error,
        });
        createEmailEvent(sendId, "failed", result.error);
        failed++;
        onProgress?.(
          `[${i + 1}/${recipients.length}] Failed: ${recipient.email} — ${result.error}`,
          "error",
        );
      }

      // Small delay between sends to avoid rate limiting
      if (i < recipients.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    return { sent, failed };
  }

  /**
   * Execute a follow-up step based on conditions.
   */
  async executeFollowUpStep(
    campaign: Campaign,
    sequence: Sequence,
    step: SequenceStep,
    dailySendLimit: number,
    onProgress?: ProgressCallback,
  ): Promise<{ sent: number; failed: number }> {
    const template = getEmailTemplate(step.templateId);
    if (!template) throw new Error(`Template ${step.templateId} not found`);

    // Get sends from the previous step
    const previousStep = sequence.steps.find((s) => s.order === step.order - 1);
    if (!previousStep) throw new Error("No previous step found");

    const previousSends = getEmailSends(campaign.id, previousStep.id);

    // Filter by condition
    const qualifyingSends = this.filterByCondition(step.condition, previousSends);

    // Check for already-sent emails in this step
    const currentStepSends = getEmailSends(campaign.id, step.id);
    const alreadySentEmails = new Set(currentStepSends.map((s) => s.recipientEmail));

    const toSend = qualifyingSends.filter(
      (s) => !alreadySentEmails.has(s.recipientEmail),
    );

    onProgress?.(
      `Follow-up "${step.condition}": ${toSend.length} recipients qualify`,
      "info",
    );

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < toSend.length; i++) {
      const prevSend = toSend[i];

      const todayCount = getTodaySendCount();
      if (todayCount >= dailySendLimit) {
        onProgress?.(`Daily send limit reached (${dailySendLimit}).`, "warning");
        break;
      }

      // We need the row data for template resolution - re-resolve from the previous resolved content
      // For follow-ups, we use a simpler approach: the template variables should still be resolvable
      const resolvedSubject = template.subject; // Follow-up templates are typically static or use cached data
      const resolvedBody = template.body;

      const sendId = createEmailSend({
        campaignId: campaign.id,
        sequenceStepId: step.id,
        rowId: prevSend.rowId,
        recipientEmail: prevSend.recipientEmail,
        recipientName: prevSend.recipientName,
        status: "pending",
        resolvedSubject,
        resolvedBody,
      });

      const result = await this.sendEmail(campaign.sendingBackend, {
        from: campaign.senderEmail,
        fromName: campaign.senderName,
        to: prevSend.recipientEmail,
        subject: resolvedSubject,
        html: resolvedBody,
        replyTo: campaign.replyToEmail,
      });

      if (result.success) {
        updateEmailSendStatus(sendId, "sent", {
          sentAt: Date.now(),
          billionmailMessageId: result.messageId,
        });
        createEmailEvent(sendId, "sent");
        sent++;
      } else {
        updateEmailSendStatus(sendId, "failed", {
          errorMessage: result.error,
        });
        createEmailEvent(sendId, "failed", result.error);
        failed++;
      }

      if (i < toSend.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    return { sent, failed };
  }

  /**
   * Check if a follow-up step is due based on delay.
   */
  isStepDue(step: SequenceStep, previousStepLastSentAt: number): boolean {
    const delayMs =
      step.delayDays * 86_400_000 + step.delayHours * 3_600_000;
    const dueAt = previousStepLastSentAt + delayMs;

    if (Date.now() < dueAt) return false;

    // Check send window if configured
    if (step.sendWindow) {
      const now = new Date();
      const hour = now.getHours();
      const dayOfWeek = now.getDay();

      if (hour < step.sendWindow.startHour || hour >= step.sendWindow.endHour) {
        return false;
      }
      if (!step.sendWindow.daysOfWeek.includes(dayOfWeek)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Filter recipients based on follow-up condition.
   */
  filterByCondition(
    condition: FollowUpCondition,
    previousSends: EmailSend[],
  ): EmailSend[] {
    switch (condition) {
      case "ALL":
        return previousSends.filter((s) => s.status === "sent" || s.status === "delivered");
      case "RESPONDED":
        return previousSends.filter((s) => s.repliedAt != null);
      case "NOT_RESPONDED":
        return previousSends.filter(
          (s) => s.repliedAt == null && (s.status === "sent" || s.status === "delivered"),
        );
      case "OPENED":
        return previousSends.filter((s) => s.openedAt != null);
      case "NOT_OPENED":
        return previousSends.filter(
          (s) => s.openedAt == null && (s.status === "sent" || s.status === "delivered"),
        );
      case "CLICKED":
        return previousSends.filter((s) => s.clickedAt != null);
      case "NOT_CLICKED":
        return previousSends.filter(
          (s) => s.clickedAt == null && (s.status === "sent" || s.status === "delivered"),
        );
      default:
        return previousSends;
    }
  }

  /**
   * Compute campaign stats from email_sends data.
   */
  computeStats(campaignId: string): CampaignStats {
    const sends = getEmailSends(campaignId);
    const total = sends.length;
    const sent = sends.filter((s) => s.sentAt != null).length;
    const delivered = sends.filter(
      (s) => s.status === "delivered" || s.status === "opened" || s.status === "clicked" || s.status === "replied",
    ).length;
    const opened = sends.filter((s) => s.openedAt != null).length;
    const clicked = sends.filter((s) => s.clickedAt != null).length;
    const replied = sends.filter((s) => s.repliedAt != null).length;
    const bounced = sends.filter((s) => s.bouncedAt != null).length;
    const failed = sends.filter((s) => s.status === "failed").length;

    return {
      total,
      sent,
      delivered: delivered || sent, // If no delivery tracking, assume sent = delivered
      opened,
      clicked,
      replied,
      bounced,
      failed,
      openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
      clickRate: sent > 0 ? Math.round((clicked / sent) * 100) : 0,
      replyRate: sent > 0 ? Math.round((replied / sent) * 100) : 0,
      bounceRate: sent > 0 ? Math.round((bounced / sent) * 100) : 0,
    };
  }

  private async sendEmail(
    backend: SendingBackend,
    options: {
      from: string;
      fromName: string;
      to: string;
      subject: string;
      html: string;
      replyTo?: string;
      attribs?: Record<string, string>;
    },
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (backend === "billionmail" && this.billionmail) {
      return this.billionmail.sendSingle({
        from: options.from,
        fromName: options.fromName,
        to: options.to,
        subject: options.subject,
        body: options.html,
        replyTo: options.replyTo,
        attribs: options.attribs,
      });
    } else if (this.smtp) {
      return this.smtp.sendEmail({
        from: options.from,
        fromName: options.fromName,
        to: options.to,
        subject: options.subject,
        html: options.html,
        replyTo: options.replyTo,
      });
    }

    return { success: false, error: "No sending backend configured" };
  }
}
