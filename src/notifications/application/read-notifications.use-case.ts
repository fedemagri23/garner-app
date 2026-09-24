import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  assertOwnership,
  type AuthenticatedUser,
} from '../../security/domain/authenticated-user.js';
import type { Notification } from '../domain/price-alert.entity.js';
import {
  NOTIFICATION_REPOSITORY,
  type NotificationRepository,
} from '../domain/notification.repository.port.js';

/** A shopper's own inbox. */
@Injectable()
export class ReadNotificationsUseCase {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: NotificationRepository,
  ) {}

  async list(
    actor: AuthenticatedUser,
    filter: { unreadOnly: boolean; skip: number; take: number },
  ): Promise<{
    notifications: Notification[];
    totalItems: number;
    unreadCount: number;
  }> {
    const [page, unreadCount] = await Promise.all([
      this.notifications.findByUser(actor.id, filter),
      this.notifications.countUnread(actor.id),
    ]);

    return { ...page, unreadCount };
  }

  /** Marking a message read twice keeps the first time it was read. */
  async markRead(
    actor: AuthenticatedUser,
    id: string,
  ): Promise<Notification> {
    const notification = await this.notifications.findById(id);

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    assertOwnership(notification.userId, actor);

    return notification.readAt
      ? notification
      : this.notifications.markRead(id, new Date());
  }
}
