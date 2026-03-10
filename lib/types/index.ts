export interface CSVRow {
  [key: string]: string;
}

export interface EnrichmentField {
  name: string;
  displayName: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  required: boolean;
}

export type EnrichmentMode = 'standard' | 'thorough';

export interface EnrichmentRequest {
  rows: CSVRow[];
  fields: EnrichmentField[];
  emailColumn: string;
  nameColumn?: string;
  useAgents?: boolean;
  useV2Architecture?: boolean;
  enrichmentMode?: EnrichmentMode;
}

export interface SearchResult {
  url: string;
  title: string;
  description: string;
  markdown?: string;
  html?: string;
  links?: string[];
  metadata?: {
    title?: string;
    description?: string;
    keywords?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
    author?: string;
    publishedDate?: string;
    [key: string]: string | undefined;
  };
}

export interface EnrichmentResult {
  field: string;
  value: string | number | boolean | string[];
  confidence: number;
  source?: string;
  sourceContext?: {
    url: string;
    snippet: string;
  }[];
  sourceCount?: number;
  corroboration?: {
    evidence: Array<{
      value: string | number | boolean | string[];
      source_url: string;
      exact_text: string;
      confidence: number;
    }>;
    sources_agree: boolean;
  };
}

export interface RowEnrichmentResult {
  rowIndex: number;
  originalData: CSVRow;
  enrichments: Record<string, EnrichmentResult>;
  status: 'pending' | 'processing' | 'completed' | 'error' | 'skipped';
  currentStep?: 'initializing' | 'searching' | 'scraping' | 'extracting' | 'finalizing';
  stepDetails?: string;
  error?: string;
}

export interface AIColumn {
  id: string;
  projectId: string;
  name: string;
  displayName: string;
  prompt: string;
  type: 'string' | 'number' | 'boolean';
  createdAt: number;
}

export interface AIColumnResult {
  id: string;
  columnId: string;
  rowId: string;
  value: string | number | boolean | null;
  status: 'pending' | 'completed' | 'error';
  error?: string;
}

export interface EnrichmentSession {
  id: string;
  totalRows: number;
  processedRows: number;
  results: RowEnrichmentResult[];
  status: 'active' | 'paused' | 'cancelled' | 'completed';
  startedAt: Date;
}

// ─── Pipeline Types ──────────────────────────────────────────

export type PipelineStepType = 'web_research' | 'ai_analysis' | 'contact_search';

export interface PipelineStep {
  id: string;
  order: number;
  name: string;
  type: PipelineStepType;
  prompt: string;
  outputFields: EnrichmentField[];
  inputColumns: string[];
  usePreviousSteps: boolean;
  contactSearchConfig?: {
    jobTitles: string[];
  };
}

export interface PipelineConfig {
  identifierColumn: string;
  steps: PipelineStep[];
}

export interface StepResult {
  stepId: string;
  stepName: string;
  fields: Record<string, EnrichmentResult>;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
}

// ─── Outreach Types ─────────────────────────────────────────

export type OutreachChannel = 'email' | 'linkedin';

export type SendingBackend = 'billionmail' | 'smtp';

export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled';

export type EmailSendStatus = 'pending' | 'queued' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'replied' | 'bounced' | 'failed';

export type FollowUpCondition = 'ALL' | 'RESPONDED' | 'NOT_RESPONDED' | 'OPENED' | 'NOT_OPENED' | 'CLICKED' | 'NOT_CLICKED';

export interface EmailTemplate {
  id: string;
  projectId: string;
  name: string;
  subject: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}

export interface SequenceStep {
  id: string;
  sequenceId: string;
  order: number;
  templateId: string;
  delayDays: number;
  delayHours: number;
  condition: FollowUpCondition;
  sendWindow?: {
    startHour: number;
    endHour: number;
    timezone: string;
    daysOfWeek: number[];
  };
}

export interface Sequence {
  id: string;
  projectId: string;
  name: string;
  steps: SequenceStep[];
  createdAt: number;
  updatedAt: number;
}

export interface Campaign {
  id: string;
  projectId: string;
  name: string;
  sequenceId: string;
  sendingBackend: SendingBackend;
  senderEmail: string;
  senderName: string;
  replyToEmail?: string;
  status: CampaignStatus;
  rowFilter?: {
    checkedRowIndices?: number[];
    requireEmail: boolean;
    emailFieldName: string;
  };
  billionmailTaskId?: string;
  billionmailGroupId?: number;
  stats?: CampaignStats;
  scheduledAt?: number;
  startedAt?: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface CampaignStats {
  total: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  failed: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
}

export interface EmailSend {
  id: string;
  campaignId: string;
  sequenceStepId: string;
  rowId: string;
  recipientEmail: string;
  recipientName?: string;
  status: EmailSendStatus;
  resolvedSubject: string;
  resolvedBody: string;
  sentAt?: number;
  openedAt?: number;
  clickedAt?: number;
  repliedAt?: number;
  bouncedAt?: number;
  errorMessage?: string;
  billionmailMessageId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface EmailEvent {
  id: string;
  emailSendId: string;
  eventType: 'sent' | 'delivered' | 'opened' | 'clicked' | 'replied' | 'bounced' | 'failed';
  metadata?: string;
  createdAt: number;
}

export interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}

export interface BillionMailConfig {
  baseUrl: string;
  apiKey: string;
}

export interface OutreachSettings {
  defaultBackend: SendingBackend;
  smtp?: SMTPConfig;
  billionmail?: BillionMailConfig;
  dailySendLimit: number;
  defaultSendWindow?: SequenceStep['sendWindow'];
}

export interface TemplateVariable {
  key: string;
  displayName: string;
  source: string;
  sampleValue?: string;
}

// ─── Warming Types ──────────────────────────────────────────

export type WarmingStatus = 'idle' | 'warming' | 'paused' | 'completed';

export interface WarmingAccount {
  id: string;
  email: string;
  name: string;
  backend: SendingBackend;
  smtp?: SMTPConfig;
  status: WarmingStatus;
  dailyTarget: number;
  currentDay: number;
  totalDays: number;
  emailsSentToday: number;
  totalEmailsSent: number;
  totalBounced: number;
  healthScore: number;
  startedAt?: number;
  pausedAt?: number;
  lastSendAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface WarmingLog {
  id: string;
  accountId: string;
  day: number;
  emailsSent: number;
  bounced: number;
  target: number;
  createdAt: number;
}