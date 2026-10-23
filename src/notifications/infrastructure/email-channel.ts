import { Logger } from '@nestjs/common';
import type { SubjectNamesLoader } from '../application/notification-names.js';
import { emailFooter, messageText } from '../domain/message-text.js';
import type { Notification } from '../domain/price-alert.entity.js';
import type {
  EmailSender,
  NotificationChannel,
  NotificationRecipient,
  UnsubscribeTokens,
} from '../domain/notification.repository.port.js';

/**
 * Email, for people who asked for it, in their language. Opt-in only, and
 * every message carries a one-click unsubscribe link (RFC 8058) that works
 * without logging in.
 */
export class EmailChannel implements NotificationChannel {
  readonly name = 'email';

  private readonly logger = new Logger(EmailChannel.name);

  constructor(
    private readonly sender: EmailSender,
    private readonly tokens: UnsubscribeTokens,
    private readonly publicBaseUrl: string,
    private readonly names: SubjectNamesLoader,
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

    const namesOf = await this.names.forSubjects([notification]);
    const { title, body } = messageText(notification, namesOf(notification), recipient.language);

    await this.sender.send({
      to: recipient.email!,
      subject: title,
      text: [body, '', ...emailFooter(recipient.language, unsubscribeUrl)].join('\n'),
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
