import nodemailer from "nodemailer";
import type { SMTPConfig } from "@/lib/types";

export class SMTPService {
  private transporter: nodemailer.Transporter;

  constructor(config: SMTPConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.username,
        pass: config.password,
      },
    });
  }

  async sendEmail(options: {
    from: string;
    fromName: string;
    to: string;
    subject: string;
    html: string;
    replyTo?: string;
  }): Promise<{ messageId: string; success: boolean; error?: string }> {
    try {
      const info = await this.transporter.sendMail({
        from: `"${options.fromName}" <${options.from}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        replyTo: options.replyTo,
      });

      return { messageId: info.messageId, success: true };
    } catch (error) {
      return {
        messageId: "",
        success: false,
        error: error instanceof Error ? error.message : "SMTP error",
      };
    }
  }

  async verify(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch {
      return false;
    }
  }
}
