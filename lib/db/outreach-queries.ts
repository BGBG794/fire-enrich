import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "./index";
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

export function createEmailTemplate(
  projectId: string,
  name: string,
  subject: string,
  body: string,
): string {
  const id = nanoid();
  const now = Date.now();
  db.insert(schema.emailTemplates)
    .values({ id, projectId, name, subject, body, createdAt: now, updatedAt: now })
    .run();
  return id;
}

export function getEmailTemplates(projectId: string): EmailTemplate[] {
  return db
    .select()
    .from(schema.emailTemplates)
    .where(eq(schema.emailTemplates.projectId, projectId))
    .all();
}

export function getEmailTemplate(id: string): EmailTemplate | null {
  return (
    db
      .select()
      .from(schema.emailTemplates)
      .where(eq(schema.emailTemplates.id, id))
      .get() ?? null
  );
}

export function updateEmailTemplate(
  id: string,
  updates: Partial<Pick<EmailTemplate, "name" | "subject" | "body">>,
): void {
  db.update(schema.emailTemplates)
    .set({ ...updates, updatedAt: Date.now() })
    .where(eq(schema.emailTemplates.id, id))
    .run();
}

export function deleteEmailTemplate(id: string): void {
  db.delete(schema.emailTemplates)
    .where(eq(schema.emailTemplates.id, id))
    .run();
}

// ─── Sequences ──────────────────────────────────────────────

export function createSequence(
  projectId: string,
  name: string,
  steps: Omit<SequenceStep, "id" | "sequenceId">[],
): string {
  const id = nanoid();
  const now = Date.now();

  db.insert(schema.sequences)
    .values({ id, projectId, name, createdAt: now, updatedAt: now })
    .run();

  for (const step of steps) {
    db.insert(schema.sequenceSteps)
      .values({
        id: nanoid(),
        sequenceId: id,
        order: step.order,
        templateId: step.templateId,
        delayDays: step.delayDays,
        delayHours: step.delayHours,
        condition: step.condition,
        sendWindow: step.sendWindow ? JSON.stringify(step.sendWindow) : null,
      })
      .run();
  }

  return id;
}

export function getSequences(projectId: string): Sequence[] {
  const seqs = db
    .select()
    .from(schema.sequences)
    .where(eq(schema.sequences.projectId, projectId))
    .all();

  return seqs.map((seq) => {
    const steps = db
      .select()
      .from(schema.sequenceSteps)
      .where(eq(schema.sequenceSteps.sequenceId, seq.id))
      .all()
      .map((s) => ({
        ...s,
        condition: s.condition as FollowUpCondition,
        sendWindow: s.sendWindow ? JSON.parse(s.sendWindow) : undefined,
      }))
      .sort((a, b) => a.order - b.order);

    return { ...seq, steps };
  });
}

export function getSequence(id: string): Sequence | null {
  const seq = db
    .select()
    .from(schema.sequences)
    .where(eq(schema.sequences.id, id))
    .get();

  if (!seq) return null;

  const steps = db
    .select()
    .from(schema.sequenceSteps)
    .where(eq(schema.sequenceSteps.sequenceId, id))
    .all()
    .map((s) => ({
      ...s,
      condition: s.condition as FollowUpCondition,
      sendWindow: s.sendWindow ? JSON.parse(s.sendWindow) : undefined,
    }))
    .sort((a, b) => a.order - b.order);

  return { ...seq, steps };
}

export function updateSequence(
  id: string,
  name: string,
  steps: Omit<SequenceStep, "id" | "sequenceId">[],
): void {
  const now = Date.now();

  db.update(schema.sequences)
    .set({ name, updatedAt: now })
    .where(eq(schema.sequences.id, id))
    .run();

  // Replace all steps
  db.delete(schema.sequenceSteps)
    .where(eq(schema.sequenceSteps.sequenceId, id))
    .run();

  for (const step of steps) {
    db.insert(schema.sequenceSteps)
      .values({
        id: nanoid(),
        sequenceId: id,
        order: step.order,
        templateId: step.templateId,
        delayDays: step.delayDays,
        delayHours: step.delayHours,
        condition: step.condition,
        sendWindow: step.sendWindow ? JSON.stringify(step.sendWindow) : null,
      })
      .run();
  }
}

export function deleteSequence(id: string): void {
  db.delete(schema.sequences).where(eq(schema.sequences.id, id)).run();
}

// ─── Campaigns ──────────────────────────────────────────────

export function createCampaign(
  data: Omit<Campaign, "id" | "stats" | "createdAt" | "updatedAt">,
): string {
  const id = nanoid();
  const now = Date.now();

  db.insert(schema.campaigns)
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
    })
    .run();

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

export function getCampaigns(projectId: string): Campaign[] {
  return db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.projectId, projectId))
    .all()
    .map(parseCampaign);
}

export function getAllCampaigns(): Campaign[] {
  return db
    .select()
    .from(schema.campaigns)
    .all()
    .map(parseCampaign);
}

export function getCampaign(id: string): Campaign | null {
  const raw = db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.id, id))
    .get();
  return raw ? parseCampaign(raw) : null;
}

export function updateCampaignStatus(
  id: string,
  status: Campaign["status"],
  extra?: Partial<Pick<Campaign, "startedAt" | "completedAt">>,
): void {
  db.update(schema.campaigns)
    .set({ status, ...extra, updatedAt: Date.now() })
    .where(eq(schema.campaigns.id, id))
    .run();
}

export function updateCampaignStats(id: string, stats: CampaignStats): void {
  db.update(schema.campaigns)
    .set({ stats: JSON.stringify(stats), updatedAt: Date.now() })
    .where(eq(schema.campaigns.id, id))
    .run();
}

export function getRunningCampaigns(): Campaign[] {
  return db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.status, "running"))
    .all()
    .map(parseCampaign);
}

export function deleteCampaign(id: string): void {
  db.delete(schema.campaigns).where(eq(schema.campaigns.id, id)).run();
}

// ─── Email Sends ────────────────────────────────────────────

export function createEmailSend(
  data: Omit<EmailSend, "id" | "createdAt" | "updatedAt">,
): string {
  const id = nanoid();
  const now = Date.now();

  db.insert(schema.emailSends)
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
    })
    .run();

  return id;
}

export function getEmailSends(campaignId: string, stepId?: string): EmailSend[] {
  const allSends = db
    .select()
    .from(schema.emailSends)
    .where(eq(schema.emailSends.campaignId, campaignId))
    .all();

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

export function updateEmailSendStatus(
  id: string,
  status: EmailSendStatus,
  metadata?: Partial<
    Pick<EmailSend, "sentAt" | "openedAt" | "clickedAt" | "repliedAt" | "bouncedAt" | "errorMessage" | "billionmailMessageId">
  >,
): void {
  db.update(schema.emailSends)
    .set({ status, ...metadata, updatedAt: Date.now() })
    .where(eq(schema.emailSends.id, id))
    .run();
}

export function getTodaySendCount(): number {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  return db
    .select()
    .from(schema.emailSends)
    .all()
    .filter((s) => s.sentAt && s.sentAt >= startOfDay.getTime()).length;
}

// ─── Email Events ───────────────────────────────────────────

export function createEmailEvent(
  emailSendId: string,
  eventType: string,
  metadata?: string,
): void {
  db.insert(schema.emailEvents)
    .values({
      id: nanoid(),
      emailSendId,
      eventType,
      metadata: metadata ?? null,
      createdAt: Date.now(),
    })
    .run();
}

export function getEmailEvents(emailSendId: string) {
  return db
    .select()
    .from(schema.emailEvents)
    .where(eq(schema.emailEvents.emailSendId, emailSendId))
    .all();
}

// ─── Outreach Settings ──────────────────────────────────────

export function getOutreachSettings(): OutreachSettings | null {
  const raw = db
    .select()
    .from(schema.outreachSettings)
    .where(eq(schema.outreachSettings.id, "default"))
    .get();

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

export function saveOutreachSettings(settings: OutreachSettings): void {
  const now = Date.now();

  // Upsert
  const existing = db
    .select()
    .from(schema.outreachSettings)
    .where(eq(schema.outreachSettings.id, "default"))
    .get();

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

  if (existing) {
    db.update(schema.outreachSettings)
      .set(values)
      .where(eq(schema.outreachSettings.id, "default"))
      .run();
  } else {
    db.insert(schema.outreachSettings).values(values).run();
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

export function createWarmingAccount(account: Omit<WarmingAccount, "id" | "createdAt" | "updatedAt" | "currentDay" | "emailsSentToday" | "totalEmailsSent" | "totalBounced" | "healthScore">): WarmingAccount {
  const now = Date.now();
  const id = nanoid();
  db.insert(schema.warmingAccounts).values({
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
  }).run();

  return getWarmingAccount(id)!;
}

export function getWarmingAccounts(): WarmingAccount[] {
  return db.select().from(schema.warmingAccounts).all().map(parseWarmingAccount);
}

export function getWarmingAccount(id: string): WarmingAccount | null {
  const raw = db.select().from(schema.warmingAccounts).where(eq(schema.warmingAccounts.id, id)).get();
  return raw ? parseWarmingAccount(raw) : null;
}

export function getActiveWarmingAccounts(): WarmingAccount[] {
  return db.select().from(schema.warmingAccounts)
    .where(eq(schema.warmingAccounts.status, "warming"))
    .all()
    .map(parseWarmingAccount);
}

export function updateWarmingAccount(id: string, updates: Partial<Record<string, unknown>>): void {
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

  db.update(schema.warmingAccounts).set(setValues).where(eq(schema.warmingAccounts.id, id)).run();
}

export function deleteWarmingAccount(id: string): void {
  db.delete(schema.warmingAccounts).where(eq(schema.warmingAccounts.id, id)).run();
}

// ─── Warming Logs ───────────────────────────────────────────

export function createWarmingLog(log: Omit<WarmingLog, "id" | "createdAt">): void {
  db.insert(schema.warmingLogs).values({
    id: nanoid(),
    accountId: log.accountId,
    day: log.day,
    emailsSent: log.emailsSent,
    bounced: log.bounced,
    target: log.target,
    createdAt: Date.now(),
  }).run();
}

export function getWarmingLogs(accountId: string): WarmingLog[] {
  return db.select().from(schema.warmingLogs)
    .where(eq(schema.warmingLogs.accountId, accountId))
    .all()
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
