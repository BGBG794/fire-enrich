import { SMTPService } from "@/lib/services/smtp";
import { BillionMailService } from "@/lib/services/billionmail";
import {
  getActiveWarmingAccounts,
  updateWarmingAccount,
  createWarmingLog,
  getOutreachSettings,
} from "@/lib/db/outreach-queries";
import type { WarmingAccount } from "@/lib/types";

const WARMING_SUBJECTS = [
  "Quick update on the project timeline",
  "Meeting reschedule request",
  "Follow-up from our last conversation",
  "Budget review notes",
  "Team offsite planning update",
  "Quarterly review summary",
  "Document review request",
  "Feedback on the proposal",
  "Schedule confirmation for next week",
  "Resource allocation update",
  "Training session reminder",
  "Client onboarding progress",
  "Status update on deliverables",
  "Action items from today's call",
  "Planning ahead for next quarter",
];

const WARMING_BODIES = [
  "Hi,\n\nJust wanted to follow up on our conversation from earlier this week. I've reviewed the documents you shared and have a few thoughts I'd like to discuss. Would you be available for a quick call tomorrow afternoon?\n\nLet me know what works best for your schedule.\n\nBest regards",
  "Hello,\n\nI hope this email finds you well. I wanted to share a brief update on the project status. We've made good progress on the key deliverables and are on track to meet the deadline. I'll send a more detailed report by end of week.\n\nPlease let me know if you have any questions.\n\nThank you",
  "Hi there,\n\nThank you for taking the time to meet with us yesterday. The discussion was very productive and I believe we're aligned on the next steps. I've noted down the action items and will circulate them by tomorrow.\n\nLooking forward to our continued collaboration.\n\nKind regards",
  "Hello,\n\nI'm reaching out to confirm our meeting scheduled for next Tuesday at 2 PM. Please let me know if this time still works for you. I'll prepare an agenda and share it beforehand so we can make the most of our time together.\n\nBest",
  "Hi,\n\nI wanted to touch base regarding the budget allocation for the upcoming quarter. After reviewing the numbers, I think we should consider reallocating some resources to priority areas. I've put together a brief summary that I'd like to review with you.\n\nWhen would be a good time to discuss?\n\nThanks",
  "Hello,\n\nJust a quick note to share the updated timeline for the project. We've adjusted a few milestones based on the feedback from the last review session. The overall delivery date remains the same, but some intermediate deadlines have shifted.\n\nHappy to walk through the changes if needed.\n\nRegards",
  "Hi,\n\nI hope you had a great weekend. I wanted to send over the revised proposal based on our discussion last Friday. I've incorporated all the feedback and adjusted the scope accordingly. Please take a look when you get a chance.\n\nLooking forward to your thoughts.\n\nBest regards",
  "Hello,\n\nI'm writing to request your input on the training schedule for next month. We have several sessions planned and I want to make sure the topics align with the team's current needs. Could you share your priorities?\n\nThank you for your help.\n\nBest",
  "Hi,\n\nQuick update on the client onboarding process. We've completed the initial setup phase and are now moving into the configuration stage. Everything is progressing smoothly and the client has been very responsive.\n\nI'll keep you posted on any developments.\n\nRegards",
  "Hello,\n\nI wanted to circle back on the action items from our last team meeting. Most items are on track, but there are a couple that need attention before the end of the week. I've highlighted them in the shared document.\n\nPlease review when you have a moment.\n\nThank you",
  "Hi,\n\nThank you for sharing the report. I've gone through it and everything looks good. I have a few minor suggestions that I think could strengthen the executive summary section. I'll add my comments directly to the document.\n\nGreat work on this.\n\nBest",
  "Hello,\n\nI hope all is well. I'm reaching out about the resource planning for the next sprint. Based on current workload and upcoming priorities, I think we might need to adjust the team allocation slightly. Let's discuss this at our next sync.\n\nThanks",
  "Hi,\n\nJust a reminder about the deadline for the quarterly review submissions. Please make sure all reports are finalized and submitted by Friday. If you need an extension, let me know as soon as possible so we can plan accordingly.\n\nBest regards",
  "Hello,\n\nI've been working on the process documentation and wanted to get your feedback before finalizing it. The document covers the main workflows and includes some recommended improvements. I've shared it via the usual channel.\n\nAppreciate your input.\n\nThanks",
  "Hi,\n\nLooking ahead to next quarter, I think it would be helpful to schedule a planning session with the full team. This would give us a chance to align on goals, review lessons learned, and set priorities. What does your availability look like?\n\nBest",
];

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getDayQuota(currentDay: number, dailyTarget: number): number {
  const calculated = Math.floor(5 * Math.pow(1.15, currentDay));
  return Math.min(calculated, dailyTarget);
}

function isSameDay(ts1: number, ts2: number): boolean {
  const d1 = new Date(ts1);
  const d2 = new Date(ts2);
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}

class WarmingEngine {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;

  start(intervalMs = 60_000) {
    if (this.intervalId) return;
    console.log("[WarmingEngine] Started");
    this.intervalId = setInterval(() => this.tick(), intervalMs);
    this.tick();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[WarmingEngine] Stopped");
    }
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const accounts = await getActiveWarmingAccounts();
      if (accounts.length === 0) {
        this.running = false;
        return;
      }

      const otherEmails = accounts.map((a) => a.email);

      for (const account of accounts) {
        await this.processAccount(account, otherEmails);
      }
    } catch (error) {
      console.error("[WarmingEngine] tick error:", error);
    } finally {
      this.running = false;
    }
  }

  private async processAccount(account: WarmingAccount, allEmails: string[]) {
    const now = Date.now();

    // Day rollover: if lastSendAt was yesterday, save log and advance day
    if (account.lastSendAt && !isSameDay(account.lastSendAt, now)) {
      const quota = getDayQuota(account.currentDay, account.dailyTarget);
      await createWarmingLog({
        accountId: account.id,
        day: account.currentDay,
        emailsSent: account.emailsSentToday,
        bounced: 0,
        target: quota,
      });

      const newDay = account.currentDay + 1;
      if (newDay >= account.totalDays) {
        await updateWarmingAccount(account.id, {
          status: "completed",
          currentDay: newDay,
          emailsSentToday: 0,
        });
        console.log(`[WarmingEngine] Account ${account.email} completed warming`);
        return;
      }

      await updateWarmingAccount(account.id, {
        currentDay: newDay,
        emailsSentToday: 0,
      });
      account.currentDay = newDay;
      account.emailsSentToday = 0;
    }

    const quota = getDayQuota(account.currentDay, account.dailyTarget);

    if (account.emailsSentToday >= quota) return;

    // Pick a recipient: another warming account, or self
    const recipients = allEmails.filter((e) => e !== account.email);
    const recipient = recipients.length > 0 ? getRandomItem(recipients) : account.email;

    const subject = getRandomItem(WARMING_SUBJECTS);
    const body = getRandomItem(WARMING_BODIES);
    const htmlBody = body.replace(/\n/g, "<br>");

    try {
      let success = false;

      if (account.backend === "smtp" && account.smtp) {
        const smtp = new SMTPService(account.smtp);
        const result = await smtp.sendEmail({
          from: account.email,
          fromName: account.name,
          to: recipient,
          subject,
          html: htmlBody,
        });
        success = result.success;
      } else if (account.backend === "billionmail") {
        const settings = await getOutreachSettings();
        if (settings?.billionmail) {
          const bm = new BillionMailService(settings.billionmail);
          const result = await bm.sendSingle({
            from: account.email,
            fromName: account.name,
            to: recipient,
            subject,
            body: htmlBody,
          });
          success = result.success;
        }
      }

      if (success) {
        await updateWarmingAccount(account.id, {
          emailsSentToday: account.emailsSentToday + 1,
          totalEmailsSent: account.totalEmailsSent + 1,
          lastSendAt: now,
        });
      } else {
        await updateWarmingAccount(account.id, {
          totalBounced: account.totalBounced + 1,
          healthScore: Math.max(0, account.healthScore - 2),
          lastSendAt: now,
        });
      }
    } catch (error) {
      console.error(`[WarmingEngine] Send error for ${account.email}:`, error);
      await updateWarmingAccount(account.id, {
        totalBounced: account.totalBounced + 1,
        healthScore: Math.max(0, account.healthScore - 5),
      });
    }
  }
}

export const warmingEngine = new WarmingEngine();
