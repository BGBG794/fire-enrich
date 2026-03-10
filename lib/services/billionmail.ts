import type { BillionMailConfig } from "@/lib/types";

export interface BillionMailSendOptions {
  from: string;
  fromName: string;
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
  attribs?: Record<string, string>;
}

export interface BillionMailStats {
  total: number;
  sent: number;
  success: number;
  fail: number;
  open: number;
  click: number;
}

interface BillionMailResponse {
  success: boolean;
  code: number;
  msg: string;
  data: unknown;
}

export class BillionMailService {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: BillionMailConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
  }

  private async request(
    path: string,
    options: RequestInit = {},
  ): Promise<BillionMailResponse> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    // Use X-API-Key for send endpoints, Bearer for management
    if (path.includes("/api/send") || path.includes("/api/batch_send")) {
      headers["X-API-Key"] = this.apiKey;
    } else {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(
        `BillionMail API error: ${response.status} ${response.statusText}`,
      );
    }

    return response.json() as Promise<BillionMailResponse>;
  }

  async sendSingle(
    options: BillionMailSendOptions,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const result = await this.request("/api/batch_mail/api/send", {
        method: "POST",
        body: JSON.stringify({
          recipient: options.to,
          addresser: options.from,
          attribs: options.attribs || {},
        }),
      });

      return { success: result.success, messageId: String(result.data ?? "") };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async batchSend(
    options: Omit<BillionMailSendOptions, "to"> & { recipients: string[] },
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.request("/api/batch_mail/api/batch_send", {
        method: "POST",
        body: JSON.stringify({
          recipients: options.recipients,
          addresser: options.from,
          attribs: options.attribs || {},
        }),
      });

      return { success: result.success };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async createTemplate(
    name: string,
    subject: string,
    body: string,
  ): Promise<{ templateId: number }> {
    const result = await this.request("/api/email_template/create", {
      method: "POST",
      body: JSON.stringify({ name, subject, body }),
    });

    return { templateId: (result.data as { id: number })?.id ?? 0 };
  }

  async createContactGroup(
    name: string,
  ): Promise<{ groupId: number }> {
    const result = await this.request("/api/contact/group/create", {
      method: "POST",
      body: JSON.stringify({ name }),
    });

    return { groupId: (result.data as { id: number })?.id ?? 0 };
  }

  async createTask(options: {
    templateId: number;
    groupId: number;
    addresser: string;
    subject: string;
    senderName: string;
    threads?: number;
    trackOpen?: boolean;
    trackClick?: boolean;
  }): Promise<{ taskId: number }> {
    const result = await this.request("/api/batch_mail/task/create", {
      method: "POST",
      body: JSON.stringify({
        addresser: options.addresser,
        subject: options.subject,
        full_name: options.senderName,
        template_id: options.templateId,
        group_id: options.groupId,
        threads: options.threads ?? 5,
        track_open: options.trackOpen !== false ? 1 : 0,
        track_click: options.trackClick !== false ? 1 : 0,
        is_record: 1,
        unsubscribe: 0,
      }),
    });

    return { taskId: (result.data as { id: number })?.id ?? 0 };
  }

  async getTaskStats(taskId: number): Promise<BillionMailStats> {
    const result = await this.request(
      `/api/batch_mail/task/overview?task_id=${taskId}`,
    );

    const data = result.data as Record<string, number>;
    return {
      total: data?.sends ?? 0,
      sent: data?.delivered ?? 0,
      success: data?.delivered ?? 0,
      fail: data?.bounced ?? 0,
      open: data?.opened ?? 0,
      click: data?.clicked ?? 0,
    };
  }

  async getMailLogs(
    taskId: number,
    page: number = 1,
    pageSize: number = 100,
  ): Promise<
    Array<{
      email: string;
      status: string;
      messageId?: string;
    }>
  > {
    const result = await this.request(
      `/api/batch_mail/task/mail-logs?task_id=${taskId}&page=${page}&page_size=${pageSize}`,
    );

    const data = result.data as
      | Array<{
          recipient: string;
          status: string;
          postfix_message_id?: string;
        }>
      | null;

    return (data ?? []).map((log) => ({
      email: log.recipient,
      status: log.status,
      messageId: log.postfix_message_id,
    }));
  }

  async ping(): Promise<boolean> {
    try {
      await this.request("/api/batch_mail/task/list?page=1&page_size=1");
      return true;
    } catch {
      return false;
    }
  }
}
