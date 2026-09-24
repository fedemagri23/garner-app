import type {
  Notification,
  NotificationCategory,
  NotificationPreferences,
  NotificationStatus,
  PriceAlert,
  PriceAlertType,
} from './price-alert.entity.js';

export interface CreatePriceAlertInput {
  ownerId: string;
  productId: string;
  type: PriceAlertType;
  storeId: string | null;
  thresholdCents: number | null;
  dropPercent: number | null;
  latitude: number | null;
  longitude: number | null;
  radiusKm: number | null;
}

export interface PriceAlertRepository {
  create(input: CreatePriceAlertInput): Promise<PriceAlert>;
  findById(id: string): Promise<PriceAlert | null>;
  findByOwner(
    ownerId: string,
    page: { skip: number; take: number },
  ): Promise<{ alerts: PriceAlert[]; totalItems: number }>;
  /** Enabled alerts watching a product, for evaluating a price change. */
  findEnabledForProduct(productId: string, limit: number): Promise<PriceAlert[]>;
  update(
    id: string,
    input: { isEnabled?: boolean; thresholdCents?: number | null; dropPercent?: number | null },
  ): Promise<PriceAlert>;
  delete(id: string): Promise<void>;
  /** Records that an alert spoke, so it does not repeat itself. */
  markTriggered(
    id: string,
    at: Date,
    notifiedPriceCents: number,
  ): Promise<void>;
}

export const PRICE_ALERT_REPOSITORY = Symbol('PRICE_ALERT_REPOSITORY');

export interface NotificationPreferencesRepository {
  find(userId: string): Promise<NotificationPreferences | null>;
  save(
    userId: string,
    input: Partial<Omit<NotificationPreferences, 'userId'>>,
  ): Promise<NotificationPreferences>;
}

export const NOTIFICATION_PREFERENCES_REPOSITORY = Symbol(
  'NOTIFICATION_PREFERENCES_REPOSITORY',
);

export interface CreateNotificationInput {
  userId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  productId: string | null;
  storeId: string | null;
  listId: string | null;
  alertId: string | null;
  dedupeKey: string;
  deliverAt: Date;
}

export interface NotificationRepository {
  /**
   * Creates the message, or returns null when its dedupe key already exists —
   * the same news raised twice is one message.
   */
  create(input: CreateNotificationInput): Promise<Notification | null>;
  findById(id: string): Promise<Notification | null>;
  findByUser(
    userId: string,
    filter: { unreadOnly: boolean; skip: number; take: number },
  ): Promise<{ notifications: Notification[]; totalItems: number }>;
  markSent(id: string, at: Date): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  markRead(id: string, at: Date): Promise<Notification>;
  /** Messages whose quiet period has passed and which are still unsent. */
  findDueForDelivery(now: Date, limit: number): Promise<Notification[]>;
  countUnread(userId: string): Promise<number>;
  /** Retention: removes delivered messages older than the cutoff. */
  deleteSentBefore(cutoff: Date, limit: number): Promise<number>;
}

export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');

export interface DeliveryResult {
  delivered: boolean;
  error?: string;
}

/**
 * Where a notification actually goes.
 *
 * One seam for every channel that might exist later — push, email, SMS — so
 * adding one does not touch how alerts are evaluated. Today's implementation
 * records the message for the client to fetch.
 */
export interface NotificationDelivery {
  readonly channel: string;
  send(notification: Notification): Promise<DeliveryResult>;
}

export const NOTIFICATION_DELIVERY = Symbol('NOTIFICATION_DELIVERY');

export interface NotificationJobs {
  /** Evaluate alerts watching a product whose price at a store changed. */
  enqueueEvaluation(input: {
    productId: string;
    storeId: string;
    priceCents: number;
    previousPriceCents: number | null;
  }): Promise<void>;
  enqueueDelivery(notificationId: string, deliverAt: Date): Promise<void>;
}

export const NOTIFICATION_JOBS = Symbol('NOTIFICATION_JOBS');

export type { NotificationStatus };
