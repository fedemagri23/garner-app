import { Injectable, Logger } from '@nestjs/common';
import type { Notification } from '../domain/price-alert.entity.js';
import type {
  NotificationChannel,
  NotificationRecipient,
} from '../domain/notification.repository.port.js';

/**
 * Delivery by storing: the message is already in the database, and clients
 * read it from `GET /v1/notifications`. Applies to everyone, always — the
 * inbox is the record every other channel is a copy of.
 */
@Injectable()
export class InAppChannel implements NotificationChannel {
  readonly name = 'in-app';

  private readonly logger = new Logger(InAppChannel.name);

  appliesTo(): boolean {
    return true;
  }

  async send(
    notification: Notification,
    recipient: NotificationRecipient,
  ): Promise<void> {
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
