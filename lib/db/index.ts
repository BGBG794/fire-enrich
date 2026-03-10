import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const queryClient = neon(DATABASE_URL);
export const db = drizzle(queryClient, { schema });
export { schema };

// ─── Schema initialization ────────────────────────────────────
let initialized = false;

export async function ensureTables() {
  if (initialized) return;
  initialized = true;

  const statements = [
    sql`CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      columns TEXT NOT NULL,
      email_column TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      row_count INTEGER NOT NULL DEFAULT 0,
      pipeline_config TEXT,
      mode TEXT DEFAULT 'standard'
    )`,
    sql`CREATE TABLE IF NOT EXISTS rows (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      row_index INTEGER NOT NULL,
      data TEXT NOT NULL
    )`,
    sql`CREATE TABLE IF NOT EXISTS enrichment_fields (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'string',
      required INTEGER NOT NULL DEFAULT 0
    )`,
    sql`CREATE TABLE IF NOT EXISTS enrichment_results (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      row_id TEXT NOT NULL REFERENCES rows(id) ON DELETE CASCADE,
      field_name TEXT NOT NULL,
      value TEXT,
      confidence REAL DEFAULT 0,
      source TEXT,
      source_context TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      created_at BIGINT NOT NULL,
      step_id TEXT,
      step_name TEXT
    )`,
    sql`CREATE TABLE IF NOT EXISTS ai_columns (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'string',
      created_at BIGINT NOT NULL
    )`,
    sql`CREATE TABLE IF NOT EXISTS ai_column_results (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      column_id TEXT NOT NULL REFERENCES ai_columns(id) ON DELETE CASCADE,
      row_id TEXT NOT NULL REFERENCES rows(id) ON DELETE CASCADE,
      value TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      created_at BIGINT NOT NULL
    )`,
    sql`CREATE INDEX IF NOT EXISTS idx_rows_project ON rows(project_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_results_project ON enrichment_results(project_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_results_row ON enrichment_results(row_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_fields_project ON enrichment_fields(project_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_ai_columns_project ON ai_columns(project_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_ai_column_results_column ON ai_column_results(column_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_ai_column_results_row ON ai_column_results(row_id)`,
    sql`CREATE TABLE IF NOT EXISTS email_templates (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )`,
    sql`CREATE TABLE IF NOT EXISTS sequences (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )`,
    sql`CREATE TABLE IF NOT EXISTS sequence_steps (
      id TEXT PRIMARY KEY,
      sequence_id TEXT NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
      step_order INTEGER NOT NULL,
      template_id TEXT NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
      delay_days INTEGER NOT NULL DEFAULT 0,
      delay_hours INTEGER NOT NULL DEFAULT 0,
      condition TEXT NOT NULL DEFAULT 'ALL',
      send_window TEXT
    )`,
    sql`CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sequence_id TEXT NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
      sending_backend TEXT NOT NULL DEFAULT 'smtp',
      sender_email TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      reply_to_email TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      row_filter TEXT,
      billionmail_task_id TEXT,
      billionmail_group_id INTEGER,
      stats TEXT,
      scheduled_at BIGINT,
      started_at BIGINT,
      completed_at BIGINT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )`,
    sql`CREATE TABLE IF NOT EXISTS email_sends (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      sequence_step_id TEXT NOT NULL REFERENCES sequence_steps(id) ON DELETE CASCADE,
      row_id TEXT NOT NULL REFERENCES rows(id) ON DELETE CASCADE,
      recipient_email TEXT NOT NULL,
      recipient_name TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      resolved_subject TEXT NOT NULL,
      resolved_body TEXT NOT NULL,
      sent_at BIGINT,
      opened_at BIGINT,
      clicked_at BIGINT,
      replied_at BIGINT,
      bounced_at BIGINT,
      error_message TEXT,
      billionmail_message_id TEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )`,
    sql`CREATE TABLE IF NOT EXISTS email_events (
      id TEXT PRIMARY KEY,
      email_send_id TEXT NOT NULL REFERENCES email_sends(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      metadata TEXT,
      created_at BIGINT NOT NULL
    )`,
    sql`CREATE TABLE IF NOT EXISTS outreach_settings (
      id TEXT PRIMARY KEY,
      default_backend TEXT NOT NULL DEFAULT 'smtp',
      smtp_config TEXT,
      billionmail_config TEXT,
      daily_send_limit INTEGER NOT NULL DEFAULT 200,
      default_send_window TEXT,
      updated_at BIGINT NOT NULL
    )`,
    sql`CREATE INDEX IF NOT EXISTS idx_email_templates_project ON email_templates(project_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_sequences_project ON sequences(project_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_sequence_steps_sequence ON sequence_steps(sequence_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_campaigns_project ON campaigns(project_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_email_sends_campaign ON email_sends(campaign_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_email_sends_row ON email_sends(row_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_email_sends_status ON email_sends(status)`,
    sql`CREATE INDEX IF NOT EXISTS idx_email_events_send ON email_events(email_send_id)`,
    sql`CREATE TABLE IF NOT EXISTS warming_accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      backend TEXT NOT NULL DEFAULT 'smtp',
      smtp_config TEXT,
      status TEXT NOT NULL DEFAULT 'idle',
      daily_target INTEGER NOT NULL DEFAULT 50,
      current_day INTEGER NOT NULL DEFAULT 0,
      total_days INTEGER NOT NULL DEFAULT 28,
      emails_sent_today INTEGER NOT NULL DEFAULT 0,
      total_emails_sent INTEGER NOT NULL DEFAULT 0,
      total_bounced INTEGER NOT NULL DEFAULT 0,
      health_score INTEGER NOT NULL DEFAULT 100,
      started_at BIGINT,
      paused_at BIGINT,
      last_send_at BIGINT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )`,
    sql`CREATE TABLE IF NOT EXISTS warming_logs (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES warming_accounts(id) ON DELETE CASCADE,
      day INTEGER NOT NULL,
      emails_sent INTEGER NOT NULL DEFAULT 0,
      bounced INTEGER NOT NULL DEFAULT 0,
      target INTEGER NOT NULL,
      created_at BIGINT NOT NULL
    )`,
    sql`CREATE INDEX IF NOT EXISTS idx_warming_logs_account ON warming_logs(account_id)`,
  ];

  for (const stmt of statements) {
    await db.execute(stmt);
  }
}
