import { Injectable } from '@nestjs/common';
import type {
  Notification as NotificationRow,
  NotificationPreferences as PreferencesRow,
  PriceAlert as PriceAlertRow,
} from '../../../generated/prisma/core/index.js';
import { CorePrismaService } from '../../common/database/core-prisma.service.js';
import { isUniqueViolation } from '../../common/database/prisma-errors.js';
import type {
  Notification,
  NotificationCategory,
  NotificationPreferences,
  NotificationStatus,
  PriceAlert,
  PriceAlertType,
} from '../domain/price-alert.entity.js';
import type {
  CreateNotificationInput,
  CreatePriceAlertInput,
  NotificationPreferencesRepository,
  NotificationRepository,
  PriceAlertRepository,
} from '../domain/notification.repository.port.js';

@Injectable()
export class PrismaPriceAlertRepository implements PriceAlertRepository {
  constructor(private readonly prisma: CorePrismaService) {}

  async create(input: CreatePriceAlertInput): Promise<PriceAlert> {
    const row = await this.prisma.priceAlert.create({ data: input });
    return this.toDomain(row);
  }

  async findById(id: string): Promise<PriceAlert | null> {
    const row = await this.prisma.priceAlert.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findByOwner(
    ownerId: string,
    page: { skip: number; take: number },
  ): Promise<{ alerts: PriceAlert[]; totalItems: number }> {
    const where = { ownerId };

    const [rows, totalItems] = await Promise.all([
      this.prisma.priceAlert.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.priceAlert.count({ where }),
    ]);

    return { alerts: rows.map((row) => this.toDomain(row)), totalItems };
  }

  async findEnabledForProduct(
    productId: string,
    limit: number,
  ): Promise<PriceAlert[]> {
    const rows = await this.prisma.priceAlert.findMany({
      where: { productId, isEnabled: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return rows.map((row) => this.toDomain(row));
  }

  async update(
    id: string,
    input: {
      isEnabled?: boolean;
      thresholdCents?: number | null;
      dropPercent?: number | null;
    },
  ): Promise<PriceAlert> {
    const row = await this.prisma.priceAlert.update({ where: { id }, data: input });
    return this.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.priceAlert.deleteMany({ where: { id } });
  }

  async markTriggered(
    id: string,
    at: Date,
    notifiedPriceCents: number,
  ): Promise<void> {
    await this.prisma.priceAlert.update({
      where: { id },
      data: { lastTriggeredAt: at, lastNotifiedPriceCents: notifiedPriceCents },
    });
  }

  private toDomain(row: PriceAlertRow): PriceAlert {
    return {
      id: row.id,
      ownerId: row.ownerId,
      productId: row.productId,
      type: row.type as PriceAlertType,
      storeId: row.storeId,
      thresholdCents: row.thresholdCents,
      dropPercent: row.dropPercent,
      latitude: row.latitude,
      longitude: row.longitude,
      radiusKm: row.radiusKm,
      isEnabled: row.isEnabled,
      lastTriggeredAt: row.lastTriggeredAt,
      lastNotifiedPriceCents: row.lastNotifiedPriceCents,
      createdAt: row.createdAt,
    };
  }
}

@Injectable()
export class PrismaNotificationPreferencesRepository
  implements NotificationPreferencesRepository
{
  constructor(private readonly prisma: CorePrismaService) {}

  async find(userId: string): Promise<NotificationPreferences | null> {
    const row = await this.prisma.notificationPreferences.findUnique({
      where: { userId },
    });

    return row ? this.toDomain(row) : null;
  }

  async save(
    userId: string,
    input: Partial<Omit<NotificationPreferences, 'userId'>>,
  ): Promise<NotificationPreferences> {
    const row = await this.prisma.notificationPreferences.upsert({
      where: { userId },
      create: { userId, ...input },
      update: input,
    });

    return this.toDomain(row);
  }

  private toDomain(row: PreferencesRow): NotificationPreferences {
    return {
      userId: row.userId,
      priceAlertsEnabled: row.priceAlertsEnabled,
      remindersEnabled: row.remindersEnabled,
      quietHoursStartUtc: row.quietHoursStartUtc,
      quietHoursEndUtc: row.quietHoursEndUtc,
      minMinutesBetweenAlerts: row.minMinutesBetweenAlerts,
    };
  }
}

@Injectable()
export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly prisma: CorePrismaService) {}

  /** Null on a duplicate dedupe key: the same news is one message. */
  async create(input: CreateNotificationInput): Promise<Notification | null> {
    try {
      const row = await this.prisma.notification.create({ data: input });
      return this.toDomain(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return null;
      }

      throw error;
    }
  }

  async findById(id: string): Promise<Notification | null> {
    const row = await this.prisma.notification.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findByUser(
    userId: string,
    filter: { unreadOnly: boolean; skip: number; take: number },
  ): Promise<{ notifications: Notification[]; totalItems: number }> {
    const where = {
      userId,
      ...(filter.unreadOnly ? { readAt: null } : {}),
    };

    const [rows, totalItems] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: filter.skip,
        take: filter.take,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { notifications: rows.map((row) => this.toDomain(row)), totalItems };
  }

  async markSent(id: string, at: Date): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id },
      data: { status: 'SENT', sentAt: at, error: null },
    });
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id },
      data: { status: 'FAILED', error: error.slice(0, 1_000) },
    });
  }

  async markRead(id: string, at: Date): Promise<Notification> {
    const row = await this.prisma.notification.update({
      where: { id },
      data: { readAt: at },
    });

    return this.toDomain(row);
  }

  async findDueForDelivery(now: Date, limit: number): Promise<Notification[]> {
    const rows = await this.prisma.notification.findMany({
      where: { status: { in: ['PENDING', 'FAILED'] }, deliverAt: { lte: now } },
      orderBy: { deliverAt: 'asc' },
      take: limit,
    });

    return rows.map((row) => this.toDomain(row));
  }

  async countUnread(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async deleteSentBefore(cutoff: Date, limit: number): Promise<number> {
    const batch = await this.prisma.notification.findMany({
      where: { status: 'SENT', createdAt: { lt: cutoff } },
      select: { id: true },
      take: limit,
    });

    if (batch.length === 0) {
      return 0;
    }

    const { count } = await this.prisma.notification.deleteMany({
      where: { id: { in: batch.map((row) => row.id) } },
    });

    return count;
  }

  private toDomain(row: NotificationRow): Notification {
    return {
      id: row.id,
      userId: row.userId,
      category: row.category as NotificationCategory,
      title: row.title,
      body: row.body,
      productId: row.productId,
      storeId: row.storeId,
      listId: row.listId,
      alertId: row.alertId,
      status: row.status as NotificationStatus,
      dedupeKey: row.dedupeKey,
      createdAt: row.createdAt,
      deliverAt: row.deliverAt,
      sentAt: row.sentAt,
      readAt: row.readAt,
      error: row.error,
    };
  }
}
