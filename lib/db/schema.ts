import { pgTable, text, integer, bigint, real } from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  columns: text("columns").notNull(), // JSON string[]
  emailColumn: text("email_column"),
  status: text("status").notNull().default("draft"),
  rowCount: integer("row_count").notNull().default(0),
  pipelineConfig: text("pipeline_config"), // JSON PipelineConfig
  mode: text("mode").default("standard"),
});

export const rows = pgTable("rows", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  rowIndex: integer("row_index").notNull(),
  data: text("data").notNull(), // JSON CSVRow
});

export const enrichmentFields = pgTable("enrichment_fields", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  description: text("description").notNull(),
  type: text("type").notNull().default("string"),
  required: integer("required").notNull().default(0),
});

export const aiColumns = pgTable("ai_columns", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  prompt: text("prompt").notNull(),
  type: text("type").notNull().default("string"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const aiColumnResults = pgTable("ai_column_results", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  columnId: text("column_id")
    .notNull()
    .references(() => aiColumns.id, { onDelete: "cascade" }),
  rowId: text("row_id")
    .notNull()
    .references(() => rows.id, { onDelete: "cascade" }),
  value: text("value"),
  status: text("status").notNull().default("pending"),
  error: text("error"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

// ─── Outreach Tables ────────────────────────────────────────

export const emailTemplates = pgTable("email_templates", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const sequences = pgTable("sequences", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const sequenceSteps = pgTable("sequence_steps", {
  id: text("id").primaryKey(),
  sequenceId: text("sequence_id")
    .notNull()
    .references(() => sequences.id, { onDelete: "cascade" }),
  order: integer("step_order").notNull(),
  templateId: text("template_id")
    .notNull()
    .references(() => emailTemplates.id, { onDelete: "cascade" }),
  delayDays: integer("delay_days").notNull().default(0),
  delayHours: integer("delay_hours").notNull().default(0),
  condition: text("condition").notNull().default("ALL"),
  sendWindow: text("send_window"),
});

export const campaigns = pgTable("campaigns", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sequenceId: text("sequence_id")
    .notNull()
    .references(() => sequences.id, { onDelete: "cascade" }),
  sendingBackend: text("sending_backend").notNull().default("smtp"),
  senderEmail: text("sender_email").notNull(),
  senderName: text("sender_name").notNull(),
  replyToEmail: text("reply_to_email"),
  status: text("status").notNull().default("draft"),
  rowFilter: text("row_filter"),
  billionmailTaskId: text("billionmail_task_id"),
  billionmailGroupId: integer("billionmail_group_id"),
  stats: text("stats"),
  scheduledAt: bigint("scheduled_at", { mode: "number" }),
  startedAt: bigint("started_at", { mode: "number" }),
  completedAt: bigint("completed_at", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const emailSends = pgTable("email_sends", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  sequenceStepId: text("sequence_step_id")
    .notNull()
    .references(() => sequenceSteps.id, { onDelete: "cascade" }),
  rowId: text("row_id")
    .notNull()
    .references(() => rows.id, { onDelete: "cascade" }),
  recipientEmail: text("recipient_email").notNull(),
  recipientName: text("recipient_name"),
  status: text("status").notNull().default("pending"),
  resolvedSubject: text("resolved_subject").notNull(),
  resolvedBody: text("resolved_body").notNull(),
  sentAt: bigint("sent_at", { mode: "number" }),
  openedAt: bigint("opened_at", { mode: "number" }),
  clickedAt: bigint("clicked_at", { mode: "number" }),
  repliedAt: bigint("replied_at", { mode: "number" }),
  bouncedAt: bigint("bounced_at", { mode: "number" }),
  errorMessage: text("error_message"),
  billionmailMessageId: text("billionmail_message_id"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const emailEvents = pgTable("email_events", {
  id: text("id").primaryKey(),
  emailSendId: text("email_send_id")
    .notNull()
    .references(() => emailSends.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  metadata: text("metadata"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const outreachSettings = pgTable("outreach_settings", {
  id: text("id").primaryKey(),
  defaultBackend: text("default_backend").notNull().default("smtp"),
  smtpConfig: text("smtp_config"),
  billionmailConfig: text("billionmail_config"),
  dailySendLimit: integer("daily_send_limit").notNull().default(200),
  defaultSendWindow: text("default_send_window"),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const warmingAccounts = pgTable("warming_accounts", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  backend: text("backend").notNull().default("smtp"),
  smtpConfig: text("smtp_config"),
  status: text("status").notNull().default("idle"),
  dailyTarget: integer("daily_target").notNull().default(50),
  currentDay: integer("current_day").notNull().default(0),
  totalDays: integer("total_days").notNull().default(28),
  emailsSentToday: integer("emails_sent_today").notNull().default(0),
  totalEmailsSent: integer("total_emails_sent").notNull().default(0),
  totalBounced: integer("total_bounced").notNull().default(0),
  healthScore: integer("health_score").notNull().default(100),
  startedAt: bigint("started_at", { mode: "number" }),
  pausedAt: bigint("paused_at", { mode: "number" }),
  lastSendAt: bigint("last_send_at", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const warmingLogs = pgTable("warming_logs", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => warmingAccounts.id, { onDelete: "cascade" }),
  day: integer("day").notNull(),
  emailsSent: integer("emails_sent").notNull().default(0),
  bounced: integer("bounced").notNull().default(0),
  target: integer("target").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const enrichmentResults = pgTable("enrichment_results", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  rowId: text("row_id")
    .notNull()
    .references(() => rows.id, { onDelete: "cascade" }),
  fieldName: text("field_name").notNull(),
  value: text("value"),
  confidence: real("confidence").default(0),
  source: text("source"),
  sourceContext: text("source_context"),
  status: text("status").notNull().default("pending"),
  error: text("error"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  stepId: text("step_id"),
  stepName: text("step_name"),
});
