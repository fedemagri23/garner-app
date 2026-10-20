import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../users/domain/user.repository.port.js';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type Notification,
} from '../domain/price-alert.entity.js';
import {
  CHANNEL_DELIVERY_LEDGER,
  DEVICE_TOKEN_REPOSITORY,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_PREFERENCES_REPOSITORY,
  NOTIFICATION_REPOSITORY,
  type ChannelDeliveryLedger,
  type DeviceTokenRepository,
  type NotificationChannel,
  type NotificationPreferencesRepository,
  type NotificationRecipient,
  type NotificationRepository,
} from '../domain/notification.repository.port.js';

/** One sweep's worth of messages whose quiet period has passed. */
const DUE_BATCH = 200;

/**
 * Tries on one channel before giving up on it. A bounced address or a
 * misconfigured provider must not keep a message in the retry loop forever.
 */
export const MAX_CHANNEL_ATTEMPTS = 5;

/**
 * Fans a message out to every channel that applies to its recipient, and
 * records what happened on each.
 *
 * Each channel's outcome is kept separately, so a retry after a partial
 * failure sends only where the message has not gone yet: an email provider
 * being down never means a second copy in the inbox, or the reverse. A
 * message is SENT once every applicable channel has either delivered it or
 * been given up on.
 */
@Injectable()
export class DeliverNotificationUseCase {
  private readonly logger = new Logger(DeliverNotificationUseCase.name);

  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: NotificationRepository,
    @Inject(NOTIFICATION_PREFERENCES_REPOSITORY)
    private readonly preferences: NotificationPreferencesRepository,
    @Inject(CHANNEL_DELIVERY_LEDGER)
    private readonly ledger: ChannelDeliveryLedger,
    @Inject(NOTIFICATION_CHANNELS)
    private readonly channels: NotificationChannel[],
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(DEVICE_TOKEN_REPOSITORY) private readonly devices: DeviceTokenRepository,
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

    return this.deliver(notification, now);
  }

  /**
   * Catches messages whose delivery job was lost, those held through quiet
   * hours, and those a channel failed on. One message failing again does not
   * stop the sweep reaching the rest.
   */
  async deliverDue(now: Date = new Date()): Promise<number> {
    const due = await this.notifications.findDueForDelivery(now, DUE_BATCH);
    let sent = 0;

    for (const notification of due) {
      try {
        if (await this.deliver(notification, now)) {
          sent += 1;
        }
      } catch {
        // Already recorded against the message and its channel.
      }
    }

    return sent;
  }

  private async deliver(notification: Notification, now: Date): Promise<boolean> {
    const recipient = await this.recipientFor(notification.userId);
    const history = new Map(
      (await this.ledger.findForNotification(notification.id)).map(
        (delivery) => [delivery.channel, delivery],
      ),
    );

    const failures: string[] = [];
    const abandoned: string[] = [];

    for (const channel of this.channels) {
      if (!channel.appliesTo(recipient)) {
        continue;
      }

      const past = history.get(channel.name);

      if (past?.sentAt) {
        continue;
      }

      if (past?.abandonedAt) {
        abandoned.push(`${channel.name}: ${past.lastError ?? 'gave up'}`);
        continue;
      }

      try {
        await channel.send(notification, recipient);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const attempts = (past?.attempts ?? 0) + 1;
        const giveUp = attempts >= MAX_CHANNEL_ATTEMPTS;

        const recorded = await this.ledger.recordFailure(
          notification.id,
          channel.name,
          message,
          giveUp ? now : null,
        );

        if (!recorded) {
          return false;
        }

        this.logger.error(
          `Delivery of notification ${notification.id} on ${channel.name} ` +
            `failed (attempt ${attempts}${giveUp ? ', giving up' : ''}): ${message}`,
        );

        (giveUp ? abandoned : failures).push(`${channel.name}: ${message}`);
        continue;
      }

      // The message was deleted while it was going out — with its account,
      // or by retention. There is nothing left to deliver or to retry.
      if (!(await this.ledger.recordSent(notification.id, channel.name, now))) {
        return false;
      }
    }

    if (failures.length > 0) {
      const summary = failures.join('; ');
      await this.notifications.markFailed(notification.id, summary);
      throw new Error(`Notification ${notification.id} not fully delivered: ${summary}`);
    }

    await this.notifications.markSent(
      notification.id,
      now,
      abandoned.length > 0 ? `Gave up on ${abandoned.join('; ')}` : null,
    );

    return true;
  }

  private async recipientFor(userId: string): Promise<NotificationRecipient> {
    const [user, preferences, phones] = await Promise.all([
      this.users.findById(userId),
      this.preferences.find(userId),
      this.devices.findByUser(userId),
    ]);

    return {
      userId,
      email: user?.email ?? null,
      preferences: preferences ?? { userId, ...DEFAULT_NOTIFICATION_PREFERENCES },
      deviceTokens: phones.map((phone) => phone.token),
    };
  }
}
