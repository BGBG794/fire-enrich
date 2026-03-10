import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  columns: text("columns").notNull(), // JSON string[]
  emailColumn: text("email_column"),
  status: text("status").notNull().default("draft"), // draft | enriching | completed
  rowCount: integer("row_count").notNull().default(0),
  pipelineConfig: text("pipeline_config"), // JSON PipelineConfig
  mode: text("mode").default("standard"), // standard | pipeline
});

export const rows = sqliteTable("rows", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  rowIndex: integer("row_index").notNull(),
  data: text("data").notNull(), // JSON CSVRow
});

export const enrichmentFields = sqliteTable("enrichment_fields", {
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

export const aiColumns = sqliteTable("ai_columns", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  prompt: text("prompt").notNull(),
  type: text("type").notNull().default("string"), // string | number | boolean
  createdAt: integer("created_at").notNull(),
});

export const aiColumnResults = sqliteTable("ai_column_results", {
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
  value: text("value"), // JSON
  status: text("status").notNull().default("pending"), // pending | completed | error
  error: text("error"),
  createdAt: integer("created_at").notNull(),
});

// ─── Outreach Tables ────────────────────────────────────────

export const emailTemplates = sqliteTable("email_templates", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const sequences = sqliteTable("sequences", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const sequenceSteps = sqliteTable("sequence_steps", {
  id: text("id").primaryKey(),
  sequenceId: text("sequence_id")
    .notNull()
    .references(() => sequences.id, { onDelete: "cascade" }),
  order: integer("order").notNull(),
  templateId: text("template_id")
    .notNull()
    .references(() => emailTemplates.id, { onDelete: "cascade" }),
  delayDays: integer("delay_days").notNull().default(0),
  delayHours: integer("delay_hours").notNull().default(0),
  condition: text("condition").notNull().default("ALL"),
  sendWindow: text("send_window"),
});

export const campaigns = sqliteTable("campaigns", {
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
  scheduledAt: integer("scheduled_at"),
  startedAt: integer("started_at"),
  completedAt: integer("completed_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const emailSends = sqliteTable("email_sends", {
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
  sentAt: integer("sent_at"),
  openedAt: integer("opened_at"),
  clickedAt: integer("clicked_at"),
  repliedAt: integer("replied_at"),
  bouncedAt: integer("bounced_at"),
  errorMessage: text("error_message"),
  billionmailMessageId: text("billionmail_message_id"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const emailEvents = sqliteTable("email_events", {
  id: text("id").primaryKey(),
  emailSendId: text("email_send_id")
    .notNull()
    .references(() => emailSends.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  metadata: text("metadata"),
  createdAt: integer("created_at").notNull(),
});

export const outreachSettings = sqliteTable("outreach_settings", {
  id: text("id").primaryKey(),
  defaultBackend: text("default_backend").notNull().default("smtp"),
  smtpConfig: text("smtp_config"),
  billionmailConfig: text("billionmail_config"),
  dailySendLimit: integer("daily_send_limit").notNull().default(200),
  defaultSendWindow: text("default_send_window"),
  updatedAt: integer("updated_at").notNull(),
});

export const warmingAccounts = sqliteTable("warming_accounts", {
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
  startedAt: integer("started_at"),
  pausedAt: integer("paused_at"),
  lastSendAt: integer("last_send_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const warmingLogs = sqliteTable("warming_logs", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => warmingAccounts.id, { onDelete: "cascade" }),
  day: integer("day").notNull(),
  emailsSent: integer("emails_sent").notNull().default(0),
  bounced: integer("bounced").notNull().default(0),
  target: integer("target").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const enrichmentResults = sqliteTable("enrichment_results", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  rowId: text("row_id")
    .notNull()
    .references(() => rows.id, { onDelete: "cascade" }),
  fieldName: text("field_name").notNull(),
  value: text("value"), // JSON
  confidence: real("confidence").default(0),
  source: text("source"),
  sourceContext: text("source_context"), // JSON {url, snippet}[]
  status: text("status").notNull().default("pending"),
  error: text("error"),
  createdAt: integer("created_at").notNull(),
  stepId: text("step_id"),
  stepName: text("step_name"),
});
