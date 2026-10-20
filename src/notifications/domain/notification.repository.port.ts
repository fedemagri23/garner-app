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
  currency: string | null;
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
  reason: PriceAlertType | null;
  priceCents: number | null;
  previousPriceCents: number | null;
  currency: string | null;
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
  /** `note` records a channel given up on, when the rest went out. */
  markSent(id: string, at: Date, note?: string | null): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  markRead(id: string, at: Date): Promise<Notification>;
  /** Messages whose quiet period has passed and which are still unsent. */
  findDueForDelivery(now: Date, limit: number): Promise<Notification[]>;
  countUnread(userId: string): Promise<number>;
  /** Retention: removes delivered messages older than the cutoff. */
  deleteSentBefore(cutoff: Date, limit: number): Promise<number>;
}

export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');

/** Who a message is for, as much as any channel needs to know. */
export interface NotificationRecipient {
  userId: string;
  /** Null when the account no longer exists. */
  email: string | null;
  preferences: NotificationPreferences;
}

/**
 * One way a notification reaches a person: the in-app inbox, email, and
 * whatever comes next (push needs a client to register devices first).
 *
 * Adding a channel touches neither how alerts are evaluated nor how delivery
 * is retried: the delivery use case fans a message out to every channel that
 * applies and records each one's outcome separately.
 */
export interface NotificationChannel {
  readonly name: string;
  /** Whether this message goes out on this channel at all, e.g. consent. */
  appliesTo(recipient: NotificationRecipient): boolean;
  /** Sends the message, or throws; a throw is retried later. */
  send(notification: Notification, recipient: NotificationRecipient): Promise<void>;
}

/** Every channel this deployment can deliver on, in order. */
export const NOTIFICATION_CHANNELS = Symbol('NOTIFICATION_CHANNELS');

export interface ChannelDelivery {
  channel: string;
  sentAt: Date | null;
  attempts: number;
  abandonedAt: Date | null;
  lastError: string | null;
}

/**
 * What happened to a notification on each channel. The record methods return
 * false when the notification itself is gone — deleted with its account, or
 * pruned — which ends its delivery rather than failing it.
 */
export interface ChannelDeliveryLedger {
  findForNotification(notificationId: string): Promise<ChannelDelivery[]>;
  recordSent(notificationId: string, channel: string, at: Date): Promise<boolean>;
  /** Counts an attempt; `abandonedAt` set means stop trying this channel. */
  recordFailure(
    notificationId: string,
    channel: string,
    error: string,
    abandonedAt: Date | null,
  ): Promise<boolean>;
}

export const CHANNEL_DELIVERY_LEDGER = Symbol('CHANNEL_DELIVERY_LEDGER');

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  headers: Record<string, string>;
}

/** Hands an email to a mail server. Throws when it is not accepted. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/**
 * Signed, non-expiring tokens for unsubscribe links. An email can sit in an
 * inbox for months; the link in it has to keep working without a login.
 */
export interface UnsubscribeTokens {
  issue(userId: string): string;
  /** The user id the token was issued for, or null if it is not genuine. */
  verify(token: string): string | null;
}

export const UNSUBSCRIBE_TOKENS = Symbol('UNSUBSCRIBE_TOKENS');

export interface NotificationJobs {
  /** Evaluate alerts watching a product whose price at a store changed. */
  enqueueEvaluation(input: {
    productId: string;
    storeId: string;
    priceCents: number;
    previousPriceCents: number | null;
    /** Absent on jobs queued before it was carried. */
    currency?: string;
  }): Promise<void>;
  enqueueDelivery(notificationId: string, deliverAt: Date): Promise<void>;
}

export const NOTIFICATION_JOBS = Symbol('NOTIFICATION_JOBS');

export type { NotificationStatus };
