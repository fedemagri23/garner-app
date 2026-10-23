import { Logger } from '@nestjs/common';
import type { SubjectNamesLoader } from '../application/notification-names.js';
import type {
  DeviceTokenRepository,
  NotificationChannel,
  NotificationRecipient,
  PushSender,
} from '../domain/notification.repository.port.js';
import type { Notification } from '../domain/price-alert.entity.js';
import { messageText } from '../domain/message-text.js';

/**
 * Push, for phones that registered. Registering is the consent: a person who
 * never turned push on has no tokens, and this channel does not apply.
 *
 * A message goes to every phone the shopper has. Phones the push service says
 * are gone are forgotten, which is not a failure; the message fails (and is
 * retried) only when no phone took it and at least one refused for a reason
 * that may pass.
 */
export class PushChannel implements NotificationChannel {
  readonly name = 'push';

  private readonly logger = new Logger(PushChannel.name);

  constructor(
    private readonly sender: PushSender,
    private readonly devices: DeviceTokenRepository,
    private readonly names: SubjectNamesLoader,
  ) {}

  appliesTo(recipient: NotificationRecipient): boolean {
    return recipient.deviceTokens.length > 0;
  }

  async send(notification: Notification, recipient: NotificationRecipient): Promise<void> {
    const namesOf = await this.names.forSubjects([notification]);
    const { title, body } = messageText(notification, namesOf(notification), recipient.language);

    const data: Record<string, string> = { notificationId: notification.id };
    if (notification.productId) data.productId = notification.productId;

    const outcomes = await this.sender.send(
      recipient.deviceTokens.map((to) => ({ to, title, body, data })),
    );

    const gone = outcomes.filter((outcome) => outcome.status === 'invalid').map((o) => o.token);
    if (gone.length > 0) {
      await this.devices.removeMany(gone);
    }

    const delivered = outcomes.filter((outcome) => outcome.status === 'ok').length;
    const refused = outcomes.find((outcome) => outcome.status === 'error');

    if (delivered === 0 && refused && refused.status === 'error') {
      throw new Error(refused.message);
    }

    this.logger.log(
      JSON.stringify({
        event: 'notification.delivered',
        channel: this.name,
        notificationId: notification.id,
        userId: recipient.userId,
        category: notification.category,
        devices: recipient.deviceTokens.length,
        delivered,
        gone: gone.length,
      }),
    );
  }
}
