import type { Campaign } from "@/lib/types";
import {
  getRunningCampaigns,
  updateCampaignStatus,
  updateCampaignStats,
  getEmailSends,
  getOutreachSettings,
  getSequence,
} from "@/lib/db/outreach-queries";
import { BillionMailService } from "@/lib/services/billionmail";
import { SMTPService } from "@/lib/services/smtp";
import { OutreachExecutor } from "./outreach-executor";

export class FollowUpScheduler {
  private interval: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  start(intervalMs: number = 60_000): void {
    if (this.interval) return;
    this.interval = setInterval(() => this.tick(), intervalMs);
    console.log(
      `[FollowUpScheduler] Started with interval ${intervalMs}ms`,
    );
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log("[FollowUpScheduler] Stopped");
    }
  }

  private async tick(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const campaigns = await getRunningCampaigns();
      if (campaigns.length === 0) {
        this.isRunning = false;
        return;
      }

      const settings = await getOutreachSettings();
      const dailyLimit = settings?.dailySendLimit ?? 200;

      // Build executor with configured backends
      let billionmail: BillionMailService | undefined;
      let smtp: SMTPService | undefined;

      if (settings?.billionmail) {
        billionmail = new BillionMailService(settings.billionmail);
      }
      if (settings?.smtp) {
        smtp = new SMTPService(settings.smtp);
      }

      const executor = new OutreachExecutor(billionmail, smtp);

      for (const campaign of campaigns) {
        try {
          await this.processCampaign(campaign, executor, dailyLimit);
        } catch (error) {
          console.error(
            `[FollowUpScheduler] Error processing campaign ${campaign.id}:`,
            error,
          );
        }
      }
    } catch (error) {
      console.error("[FollowUpScheduler] Tick error:", error);
    } finally {
      this.isRunning = false;
    }
  }

  private async processCampaign(
    campaign: Campaign,
    executor: OutreachExecutor,
    dailyLimit: number,
  ): Promise<void> {
    const sequence = await getSequence(campaign.sequenceId);
    if (!sequence) return;

    const sortedSteps = [...sequence.steps].sort((a, b) => a.order - b.order);

    let allStepsComplete = true;

    for (const step of sortedSteps) {
      if (step.order === 0) continue; // Initial step already sent at launch

      // Check if this step has already been fully executed
      const stepSends = await getEmailSends(campaign.id, step.id);
      if (stepSends.length > 0) continue; // Already executed

      // Find the previous step's sends to check timing
      const previousStep = sortedSteps.find((s) => s.order === step.order - 1);
      if (!previousStep) continue;

      const previousSends = await getEmailSends(campaign.id, previousStep.id);
      if (previousSends.length === 0) {
        allStepsComplete = false;
        continue; // Previous step hasn't been sent yet
      }

      // Check if delay has elapsed (from the last send of the previous step)
      const lastSentAt = Math.max(
        ...previousSends
          .filter((s) => s.sentAt != null)
          .map((s) => s.sentAt!),
      );

      if (!executor.isStepDue(step, lastSentAt)) {
        allStepsComplete = false;
        continue; // Not yet time
      }

      // Execute the follow-up step
      console.log(
        `[FollowUpScheduler] Executing follow-up step ${step.order} for campaign ${campaign.id}`,
      );

      await executor.executeFollowUpStep(
        campaign,
        sequence,
        step,
        dailyLimit,
        (msg, type) => {
          console.log(`[FollowUpScheduler] [${type}] ${msg}`);
        },
      );

      allStepsComplete = false; // Just executed, need to check again next tick
    }

    // Update stats
    const stats = await executor.computeStats(campaign.id);
    await updateCampaignStats(campaign.id, stats);

    // Check if all steps are complete
    if (allStepsComplete && sortedSteps.length > 1) {
      // Verify all steps have been executed
      const allExecutedChecks = await Promise.all(
        sortedSteps.map(async (step) => {
          const sends = await getEmailSends(campaign.id, step.id);
          return sends.length > 0;
        }),
      );
      const allExecuted = allExecutedChecks.every(Boolean);

      if (allExecuted) {
        await updateCampaignStatus(campaign.id, "completed", {
          completedAt: Date.now(),
        });
        console.log(
          `[FollowUpScheduler] Campaign ${campaign.id} completed`,
        );
      }
    }
  }
}

// Singleton instance
export const followUpScheduler = new FollowUpScheduler();
