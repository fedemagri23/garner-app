import { Injectable, Logger } from '@nestjs/common';
import type { Notification } from '../domain/price-alert.entity.js';
import type {
  DeliveryResult,
  NotificationDelivery,
} from '../domain/notification.repository.port.js';

/**
 * Delivery by storing: the message is already in the database, and clients
 * read it from `GET /v1/notifications`.
 *
 * This is the whole channel today, and it is a real one — an app polling its
 * inbox needs nothing else. Push, email and SMS are further implementations of
 * this port, and adding one changes nothing about how alerts are evaluated.
 */
@Injectable()
export class StoredNotificationDelivery implements NotificationDelivery {
  readonly channel = 'in-app';

  private readonly logger = new Logger(StoredNotificationDelivery.name);

  async send(notification: Notification): Promise<DeliveryResult> {
    this.logger.log(
      JSON.stringify({
        event: 'notification.delivered',
        channel: this.channel,
        notificationId: notification.id,
        userId: notification.userId,
        category: notification.category,
      }),
    );

    return { delivered: true };
  }
}
