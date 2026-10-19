import { createTransport, type Transporter } from 'nodemailer';
import type {
  EmailMessage,
  EmailSender,
} from '../domain/notification.repository.port.js';

/**
 * Any SMTP server — a provider's relay (SES, Postmark, Mailgun all speak it)
 * or, in development and CI, the compose stack's Mailpit.
 */
export class SmtpEmailSender implements EmailSender {
  private readonly transport: Transporter;

  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.transport = createTransport(smtpUrl);
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      headers: message.headers,
    });
  }
}
