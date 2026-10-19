import { Logger } from '@nestjs/common';
import type { Notification } from '../domain/price-alert.entity.js';
import type {
  EmailSender,
  NotificationChannel,
  NotificationRecipient,
  UnsubscribeTokens,
} from '../domain/notification.repository.port.js';

/**
 * Email, for people who asked for it. Opt-in only, and every message carries
 * a one-click unsubscribe link (RFC 8058) that works without logging in.
 */
export class EmailChannel implements NotificationChannel {
  readonly name = 'email';

  private readonly logger = new Logger(EmailChannel.name);

  constructor(
    private readonly sender: EmailSender,
    private readonly tokens: UnsubscribeTokens,
    private readonly publicBaseUrl: string,
  ) {}

  appliesTo(recipient: NotificationRecipient): boolean {
    return recipient.preferences.emailEnabled && recipient.email !== null;
  }

  async send(
    notification: Notification,
    recipient: NotificationRecipient,
  ): Promise<void> {
    const unsubscribeUrl =
      `${this.publicBaseUrl}/v1/notification-emails/unsubscribe` +
      `?token=${encodeURIComponent(this.tokens.issue(recipient.userId))}`;

    await this.sender.send({
      to: recipient.email!,
      subject: notification.title,
      text: [
        notification.body,
        '',
        '—',
        'You are receiving this because you turned on email alerts in Garner.',
        `Stop these emails: ${unsubscribeUrl}`,
      ].join('\n'),
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });

    this.logger.log(
      JSON.stringify({
        event: 'notification.delivered',
        channel: this.name,
        notificationId: notification.id,
        userId: recipient.userId,
        category: notification.category,
      }),
    );
  }
}
