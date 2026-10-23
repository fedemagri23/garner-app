import type { Language } from '../../common/i18n/language.js';
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
  /** The phones registered for push; none when the shopper never turned it on. */
  deviceTokens: string[];
  /** What push and email are written in. */
  language: Language;
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

/** A phone registered to be told things while the app is closed. */
export interface DeviceToken {
  id: string;
  userId: string;
  token: string;
  platform: string;
  createdAt: Date;
  lastSeenAt: Date;
}

export interface DeviceTokenRepository {
  /**
   * Registers a token for this account, or moves it here if another account
   * had it: a phone belongs to whoever is signed in on it.
   */
  upsert(userId: string, token: string, platform: string): Promise<DeviceToken>;
  findByUser(userId: string): Promise<DeviceToken[]>;
  /** Forgets one of this account's tokens. Forgetting an unknown one is fine. */
  remove(userId: string, token: string): Promise<void>;
  /** Drops tokens the push service says are no longer valid. */
  removeMany(tokens: string[]): Promise<void>;
}

export const DEVICE_TOKEN_REPOSITORY = Symbol('DEVICE_TOKEN_REPOSITORY');

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  /** Delivered with the message, for the app to act on when it is tapped. */
  data: Record<string, string>;
}

/** What the push service made of one message. */
export type PushOutcome =
  | { token: string; status: 'ok' }
  /** The phone is gone (app uninstalled, token expired): forget it. */
  | { token: string; status: 'invalid' }
  /** Refused for a reason that may pass; worth trying again. */
  | { token: string; status: 'error'; message: string };

export interface PushSender {
  /** Throws when the service could not be reached at all. */
  send(messages: PushMessage[]): Promise<PushOutcome[]>;
}

export const PUSH_SENDER = Symbol('PUSH_SENDER');
