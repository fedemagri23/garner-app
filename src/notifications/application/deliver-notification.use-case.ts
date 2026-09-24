import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Notification } from '../domain/price-alert.entity.js';
import {
  NOTIFICATION_DELIVERY,
  NOTIFICATION_REPOSITORY,
  type NotificationDelivery,
  type NotificationRepository,
} from '../domain/notification.repository.port.js';

/** One sweep's worth of messages whose quiet period has passed. */
const DUE_BATCH = 200;

/**
 * Hands a message to the delivery channel and records what happened.
 *
 * Delivering twice is harmless but pointless, so a message already sent is
 * skipped; a failure is recorded and left for the retry rather than lost.
 */
@Injectable()
export class DeliverNotificationUseCase {
  private readonly logger = new Logger(DeliverNotificationUseCase.name);

  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: NotificationRepository,
    @Inject(NOTIFICATION_DELIVERY)
    private readonly delivery: NotificationDelivery,
  ) {}

  async execute(notificationId: string, now: Date = new Date()): Promise<boolean> {
    const notification = await this.notifications.findById(notificationId);

    if (!notification || notification.status === 'SENT') {
      return false;
    }

    // Still inside the shopper's quiet hours; the sweep will pick it up.
    if (notification.deliverAt > now) {
      return false;
    }

    return this.send(notification, now);
  }

  /**
   * Catches messages whose delivery job was lost, and those held through quiet
   * hours. Both are cases where the message exists but nothing is coming for it.
   */
  async deliverDue(now: Date = new Date()): Promise<number> {
    const due = await this.notifications.findDueForDelivery(now, DUE_BATCH);
    let sent = 0;

    for (const notification of due) {
      if (await this.send(notification, now)) {
        sent += 1;
      }
    }

    return sent;
  }

  private async send(notification: Notification, now: Date): Promise<boolean> {
    try {
      const result = await this.delivery.send(notification);

      if (result.delivered) {
        await this.notifications.markSent(notification.id, now);
        return true;
      }

      await this.notifications.markFailed(
        notification.id,
        result.error ?? 'Delivery refused',
      );
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Delivery of notification ${notification.id} failed: ${message}`,
      );
      await this.notifications.markFailed(notification.id, message);

      throw error;
    }
  }
}
