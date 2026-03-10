import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema, ensureTables } from "./index";
import type {
  EmailTemplate,
  Sequence,
  SequenceStep,
  Campaign,
  CampaignStats,
  EmailSend,
  EmailSendStatus,
  OutreachSettings,
  FollowUpCondition,
  WarmingAccount,
  WarmingLog,
  SendingBackend,
} from "../types";

// ─── Email Templates ────────────────────────────────────────

export async function createEmailTemplate(
  projectId: string,
  name: string,
  subject: string,
  body: string,
): Promise<string> {
  await ensureTables();
  const id = nanoid();
  const now = Date.now();
  await db.insert(schema.emailTemplates)
    .values({ id, projectId, name, subject, body, createdAt: now, updatedAt: now });
  return id;
}

export async function getEmailTemplates(projectId: string): Promise<EmailTemplate[]> {
  await ensureTables();
  return db
    .select()
    .from(schema.emailTemplates)
    .where(eq(schema.emailTemplates.projectId, projectId));
}

export async function getEmailTemplate(id: string): Promise<EmailTemplate | null> {
  await ensureTables();
  const results = await db
    .select()
    .from(schema.emailTemplates)
    .where(eq(schema.emailTemplates.id, id));
  return results[0] ?? null;
}

export async function updateEmailTemplate(
  id: string,
  updates: Partial<Pick<EmailTemplate, "name" | "subject" | "body">>,
): Promise<void> {
  await ensureTables();
  await db.update(schema.emailTemplates)
    .set({ ...updates, updatedAt: Date.now() })
    .where(eq(schema.emailTemplates.id, id));
}

export async function deleteEmailTemplate(id: string): Promise<void> {
  await ensureTables();
  await db.delete(schema.emailTemplates)
    .where(eq(schema.emailTemplates.id, id));
}

// ─── Sequences ──────────────────────────────────────────────

export async function createSequence(
  projectId: string,
  name: string,
  steps: Omit<SequenceStep, "id" | "sequenceId">[],
): Promise<string> {
  await ensureTables();
  const id = nanoid();
  const now = Date.now();

  await db.insert(schema.sequences)
    .values({ id, projectId, name, createdAt: now, updatedAt: now });

  for (const step of steps) {
    await db.insert(schema.sequenceSteps)
      .values({
        id: nanoid(),
        sequenceId: id,
        order: step.order,
        templateId: step.templateId,
        delayDays: step.delayDays,
        delayHours: step.delayHours,
        condition: step.condition,
        sendWindow: step.sendWindow ? JSON.stringify(step.sendWindow) : null,
      });
  }

  return id;
}

export async function getSequences(projectId: string): Promise<Sequence[]> {
  await ensureTables();
  const seqs = await db
    .select()
    .from(schema.sequences)
    .where(eq(schema.sequences.projectId, projectId));

  const result: Sequence[] = [];
  for (const seq of seqs) {
    const steps = (await db
      .select()
      .from(schema.sequenceSteps)
      .where(eq(schema.sequenceSteps.sequenceId, seq.id)))
      .map((s) => ({
        ...s,
        condition: s.condition as FollowUpCondition,
        sendWindow: s.sendWindow ? JSON.parse(s.sendWindow) : undefined,
      }))
      .sort((a, b) => a.order - b.order);

    result.push({ ...seq, steps });
  }

  return result;
}

export async function getSequence(id: string): Promise<Sequence | null> {
  await ensureTables();
  const seqResults = await db
    .select()
    .from(schema.sequences)
    .where(eq(schema.sequences.id, id));

  const seq = seqResults[0];
  if (!seq) return null;

  const steps = (await db
    .select()
    .from(schema.sequenceSteps)
    .where(eq(schema.sequenceSteps.sequenceId, id)))
    .map((s) => ({
      ...s,
      condition: s.condition as FollowUpCondition,
      sendWindow: s.sendWindow ? JSON.parse(s.sendWindow) : undefined,
    }))
    .sort((a, b) => a.order - b.order);

  return { ...seq, steps };
}

export async function updateSequence(
  id: string,
  name: string,
  steps: Omit<SequenceStep, "id" | "sequenceId">[],
): Promise<void> {
  await ensureTables();
  const now = Date.now();

  await db.update(schema.sequences)
    .set({ name, updatedAt: now })
    .where(eq(schema.sequences.id, id));

  await db.delete(schema.sequenceSteps)
    .where(eq(schema.sequenceSteps.sequenceId, id));

  for (const step of steps) {
    await db.insert(schema.sequenceSteps)
      .values({
        id: nanoid(),
        sequenceId: id,
        order: step.order,
        templateId: step.templateId,
        delayDays: step.delayDays,
        delayHours: step.delayHours,
        condition: step.condition,
        sendWindow: step.sendWindow ? JSON.stringify(step.sendWindow) : null,
      });
  }
}

export async function deleteSequence(id: string): Promise<void> {
  await ensureTables();
  await db.delete(schema.sequences).where(eq(schema.sequences.id, id));
}

// ─── Campaigns ──────────────────────────────────────────────

export async function createCampaign(
  data: Omit<Campaign, "id" | "stats" | "createdAt" | "updatedAt">,
): Promise<string> {
  await ensureTables();
  const id = nanoid();
  const now = Date.now();

  await db.insert(schema.campaigns)
    .values({
      id,
      projectId: data.projectId,
      name: data.name,
      sequenceId: data.sequenceId,
      sendingBackend: data.sendingBackend,
      senderEmail: data.senderEmail,
      senderName: data.senderName,
      replyToEmail: data.replyToEmail ?? null,
      status: data.status,
      rowFilter: data.rowFilter ? JSON.stringify(data.rowFilter) : null,
      billionmailTaskId: data.billionmailTaskId ?? null,
      billionmailGroupId: data.billionmailGroupId ?? null,
      scheduledAt: data.scheduledAt ?? null,
      startedAt: data.startedAt ?? null,
      completedAt: data.completedAt ?? null,
      createdAt: now,
      updatedAt: now,
    });

  return id;
}

function parseCampaign(raw: typeof schema.campaigns.$inferSelect): Campaign {
  return {
    ...raw,
    sendingBackend: raw.sendingBackend as Campaign["sendingBackend"],
    status: raw.status as Campaign["status"],
    rowFilter: raw.rowFilter ? JSON.parse(raw.rowFilter) : undefined,
    stats: raw.stats ? JSON.parse(raw.stats) : undefined,
    replyToEmail: raw.replyToEmail ?? undefined,
    billionmailTaskId: raw.billionmailTaskId ?? undefined,
    billionmailGroupId: raw.billionmailGroupId ?? undefined,
    scheduledAt: raw.scheduledAt ?? undefined,
    startedAt: raw.startedAt ?? undefined,
    completedAt: raw.completedAt ?? undefined,
  };
}

export async function getCampaigns(projectId: string): Promise<Campaign[]> {
  await ensureTables();
  return (await db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.projectId, projectId)))
    .map(parseCampaign);
}

export async function getAllCampaigns(): Promise<Campaign[]> {
  await ensureTables();
  return (await db
    .select()
    .from(schema.campaigns))
    .map(parseCampaign);
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  await ensureTables();
  const results = await db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.id, id));
  return results[0] ? parseCampaign(results[0]) : null;
}

export async function updateCampaignStatus(
  id: string,
  status: Campaign["status"],
  extra?: Partial<Pick<Campaign, "startedAt" | "completedAt">>,
): Promise<void> {
  await ensureTables();
  await db.update(schema.campaigns)
    .set({ status, ...extra, updatedAt: Date.now() })
    .where(eq(schema.campaigns.id, id));
}

export async function updateCampaignStats(id: string, stats: CampaignStats): Promise<void> {
  await ensureTables();
  await db.update(schema.campaigns)
    .set({ stats: JSON.stringify(stats), updatedAt: Date.now() })
    .where(eq(schema.campaigns.id, id));
}

export async function getRunningCampaigns(): Promise<Campaign[]> {
  await ensureTables();
  return (await db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.status, "running")))
    .map(parseCampaign);
}

export async function deleteCampaign(id: string): Promise<void> {
  await ensureTables();
  await db.delete(schema.campaigns).where(eq(schema.campaigns.id, id));
}

// ─── Email Sends ────────────────────────────────────────────

export async function createEmailSend(
  data: Omit<EmailSend, "id" | "createdAt" | "updatedAt">,
): Promise<string> {
  await ensureTables();
  const id = nanoid();
  const now = Date.now();

  await db.insert(schema.emailSends)
    .values({
      id,
      campaignId: data.campaignId,
      sequenceStepId: data.sequenceStepId,
      rowId: data.rowId,
      recipientEmail: data.recipientEmail,
      recipientName: data.recipientName ?? null,
      status: data.status,
      resolvedSubject: data.resolvedSubject,
      resolvedBody: data.resolvedBody,
      sentAt: data.sentAt ?? null,
      openedAt: data.openedAt ?? null,
      clickedAt: data.clickedAt ?? null,
      repliedAt: data.repliedAt ?? null,
      bouncedAt: data.bouncedAt ?? null,
      errorMessage: data.errorMessage ?? null,
      billionmailMessageId: data.billionmailMessageId ?? null,
      createdAt: now,
      updatedAt: now,
    });

  return id;
}

export async function getEmailSends(campaignId: string, stepId?: string): Promise<EmailSend[]> {
  await ensureTables();
  const allSends = await db
    .select()
    .from(schema.emailSends)
    .where(eq(schema.emailSends.campaignId, campaignId));

  const filtered = stepId
    ? allSends.filter((s) => s.sequenceStepId === stepId)
    : allSends;

  return filtered.map((s) => ({
    ...s,
    status: s.status as EmailSendStatus,
    recipientName: s.recipientName ?? undefined,
    sentAt: s.sentAt ?? undefined,
    openedAt: s.openedAt ?? undefined,
    clickedAt: s.clickedAt ?? undefined,
    repliedAt: s.repliedAt ?? undefined,
    bouncedAt: s.bouncedAt ?? undefined,
    errorMessage: s.errorMessage ?? undefined,
    billionmailMessageId: s.billionmailMessageId ?? undefined,
  }));
}

export async function updateEmailSendStatus(
  id: string,
  status: EmailSendStatus,
  metadata?: Partial<
    Pick<EmailSend, "sentAt" | "openedAt" | "clickedAt" | "repliedAt" | "bouncedAt" | "errorMessage" | "billionmailMessageId">
  >,
): Promise<void> {
  await ensureTables();
  await db.update(schema.emailSends)
    .set({ status, ...metadata, updatedAt: Date.now() })
    .where(eq(schema.emailSends.id, id));
}

export async function getTodaySendCount(): Promise<number> {
  await ensureTables();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const allSends = await db
    .select()
    .from(schema.emailSends);

  return allSends.filter((s) => s.sentAt && s.sentAt >= startOfDay.getTime()).length;
}

// ─── Email Events ───────────────────────────────────────────

export async function createEmailEvent(
  emailSendId: string,
  eventType: string,
  metadata?: string,
): Promise<void> {
  await ensureTables();
  await db.insert(schema.emailEvents)
    .values({
      id: nanoid(),
      emailSendId,
      eventType,
      metadata: metadata ?? null,
      createdAt: Date.now(),
    });
}

export async function getEmailEvents(emailSendId: string) {
  await ensureTables();
  return db
    .select()
    .from(schema.emailEvents)
    .where(eq(schema.emailEvents.emailSendId, emailSendId));
}

// ─── Outreach Settings ──────────────────────────────────────

export async function getOutreachSettings(): Promise<OutreachSettings | null> {
  await ensureTables();
  const results = await db
    .select()
    .from(schema.outreachSettings)
    .where(eq(schema.outreachSettings.id, "default"));

  const raw = results[0];
  if (!raw) return null;

  return {
    defaultBackend: raw.defaultBackend as OutreachSettings["defaultBackend"],
    smtp: raw.smtpConfig ? JSON.parse(raw.smtpConfig) : undefined,
    billionmail: raw.billionmailConfig
      ? JSON.parse(raw.billionmailConfig)
      : undefined,
    dailySendLimit: raw.dailySendLimit,
    defaultSendWindow: raw.defaultSendWindow
      ? JSON.parse(raw.defaultSendWindow)
      : undefined,
  };
}

export async function saveOutreachSettings(settings: OutreachSettings): Promise<void> {
  await ensureTables();
  const now = Date.now();

  const existing = await db
    .select()
    .from(schema.outreachSettings)
    .where(eq(schema.outreachSettings.id, "default"));

  const values = {
    id: "default",
    defaultBackend: settings.defaultBackend,
    smtpConfig: settings.smtp ? JSON.stringify(settings.smtp) : null,
    billionmailConfig: settings.billionmail
      ? JSON.stringify(settings.billionmail)
      : null,
    dailySendLimit: settings.dailySendLimit,
    defaultSendWindow: settings.defaultSendWindow
      ? JSON.stringify(settings.defaultSendWindow)
      : null,
    updatedAt: now,
  };

  if (existing[0]) {
    await db.update(schema.outreachSettings)
      .set(values)
      .where(eq(schema.outreachSettings.id, "default"));
  } else {
    await db.insert(schema.outreachSettings).values(values);
  }
}

// ─── Warming Accounts ───────────────────────────────────────

function parseWarmingAccount(raw: typeof schema.warmingAccounts.$inferSelect): WarmingAccount {
  return {
    id: raw.id,
    email: raw.email,
    name: raw.name,
    backend: raw.backend as SendingBackend,
    smtp: raw.smtpConfig ? JSON.parse(raw.smtpConfig) : undefined,
    status: raw.status as WarmingAccount["status"],
    dailyTarget: raw.dailyTarget,
    currentDay: raw.currentDay,
    totalDays: raw.totalDays,
    emailsSentToday: raw.emailsSentToday,
    totalEmailsSent: raw.totalEmailsSent,
    totalBounced: raw.totalBounced,
    healthScore: raw.healthScore,
    startedAt: raw.startedAt ?? undefined,
    pausedAt: raw.pausedAt ?? undefined,
    lastSendAt: raw.lastSendAt ?? undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export async function createWarmingAccount(account: Omit<WarmingAccount, "id" | "createdAt" | "updatedAt" | "currentDay" | "emailsSentToday" | "totalEmailsSent" | "totalBounced" | "healthScore">): Promise<WarmingAccount> {
  await ensureTables();
  const now = Date.now();
  const id = nanoid();
  await db.insert(schema.warmingAccounts).values({
    id,
    email: account.email,
    name: account.name,
    backend: account.backend,
    smtpConfig: account.smtp ? JSON.stringify(account.smtp) : null,
    status: account.status,
    dailyTarget: account.dailyTarget,
    currentDay: 0,
    totalDays: account.totalDays,
    emailsSentToday: 0,
    totalEmailsSent: 0,
    totalBounced: 0,
    healthScore: 100,
    startedAt: account.startedAt ?? null,
    pausedAt: null,
    lastSendAt: null,
    createdAt: now,
    updatedAt: now,
  });

  return (await getWarmingAccount(id))!;
}

export async function getWarmingAccounts(): Promise<WarmingAccount[]> {
  await ensureTables();
  return (await db.select().from(schema.warmingAccounts)).map(parseWarmingAccount);
}

export async function getWarmingAccount(id: string): Promise<WarmingAccount | null> {
  await ensureTables();
  const results = await db.select().from(schema.warmingAccounts).where(eq(schema.warmingAccounts.id, id));
  return results[0] ? parseWarmingAccount(results[0]) : null;
}

export async function getActiveWarmingAccounts(): Promise<WarmingAccount[]> {
  await ensureTables();
  return (await db.select().from(schema.warmingAccounts)
    .where(eq(schema.warmingAccounts.status, "warming")))
    .map(parseWarmingAccount);
}

export async function updateWarmingAccount(id: string, updates: Partial<Record<string, unknown>>): Promise<void> {
  await ensureTables();
  const setValues: Record<string, unknown> = { updatedAt: Date.now() };
  if (updates.email !== undefined) setValues.email = updates.email;
  if (updates.name !== undefined) setValues.name = updates.name;
  if (updates.backend !== undefined) setValues.backend = updates.backend;
  if (updates.smtp !== undefined) setValues.smtpConfig = updates.smtp ? JSON.stringify(updates.smtp) : null;
  if (updates.status !== undefined) setValues.status = updates.status;
  if (updates.dailyTarget !== undefined) setValues.dailyTarget = updates.dailyTarget;
  if (updates.currentDay !== undefined) setValues.currentDay = updates.currentDay;
  if (updates.totalDays !== undefined) setValues.totalDays = updates.totalDays;
  if (updates.emailsSentToday !== undefined) setValues.emailsSentToday = updates.emailsSentToday;
  if (updates.totalEmailsSent !== undefined) setValues.totalEmailsSent = updates.totalEmailsSent;
  if (updates.totalBounced !== undefined) setValues.totalBounced = updates.totalBounced;
  if (updates.healthScore !== undefined) setValues.healthScore = updates.healthScore;
  if (updates.startedAt !== undefined) setValues.startedAt = updates.startedAt;
  if (updates.pausedAt !== undefined) setValues.pausedAt = updates.pausedAt;
  if (updates.lastSendAt !== undefined) setValues.lastSendAt = updates.lastSendAt;

  await db.update(schema.warmingAccounts).set(setValues).where(eq(schema.warmingAccounts.id, id));
}

export async function deleteWarmingAccount(id: string): Promise<void> {
  await ensureTables();
  await db.delete(schema.warmingAccounts).where(eq(schema.warmingAccounts.id, id));
}

// ─── Warming Logs ───────────────────────────────────────────

export async function createWarmingLog(log: Omit<WarmingLog, "id" | "createdAt">): Promise<void> {
  await ensureTables();
  await db.insert(schema.warmingLogs).values({
    id: nanoid(),
    accountId: log.accountId,
    day: log.day,
    emailsSent: log.emailsSent,
    bounced: log.bounced,
    target: log.target,
    createdAt: Date.now(),
  });
}

export async function getWarmingLogs(accountId: string): Promise<WarmingLog[]> {
  await ensureTables();
  return (await db.select().from(schema.warmingLogs)
    .where(eq(schema.warmingLogs.accountId, accountId)))
    .map((raw) => ({
      id: raw.id,
      accountId: raw.accountId,
      day: raw.day,
      emailsSent: raw.emailsSent,
      bounced: raw.bounced,
      target: raw.target,
      createdAt: raw.createdAt,
    }));
}
