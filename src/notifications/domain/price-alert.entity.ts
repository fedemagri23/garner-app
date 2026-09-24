export const PriceAlertType = {
  BelowThreshold: 'BELOW_THRESHOLD',
  PriceDrop: 'PRICE_DROP',
  CheaperNearby: 'CHEAPER_NEARBY',
} as const;

export type PriceAlertType =
  (typeof PriceAlertType)[keyof typeof PriceAlertType];

export const NotificationCategory = {
  PriceAlert: 'PRICE_ALERT',
  ShoppingReminder: 'SHOPPING_REMINDER',
} as const;

export type NotificationCategory =
  (typeof NotificationCategory)[keyof typeof NotificationCategory];

export const NotificationStatus = {
  Pending: 'PENDING',
  Sent: 'SENT',
  Failed: 'FAILED',
} as const;

export type NotificationStatus =
  (typeof NotificationStatus)[keyof typeof NotificationStatus];

export interface PriceAlert {
  id: string;
  ownerId: string;
  productId: string;
  type: PriceAlertType;
  storeId: string | null;
  thresholdCents: number | null;
  dropPercent: number | null;
  latitude: number | null;
  longitude: number | null;
  radiusKm: number | null;
  isEnabled: boolean;
  lastTriggeredAt: Date | null;
  lastNotifiedPriceCents: number | null;
  createdAt: Date;
}

export interface NotificationPreferences {
  userId: string;
  priceAlertsEnabled: boolean;
  remindersEnabled: boolean;
  quietHoursStartUtc: number | null;
  quietHoursEndUtc: number | null;
  minMinutesBetweenAlerts: number;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: Omit<
  NotificationPreferences,
  'userId'
> = {
  priceAlertsEnabled: true,
  remindersEnabled: true,
  quietHoursStartUtc: null,
  quietHoursEndUtc: null,
  minMinutesBetweenAlerts: 360,
};

export interface Notification {
  id: string;
  userId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  productId: string | null;
  storeId: string | null;
  listId: string | null;
  alertId: string | null;
  status: NotificationStatus;
  dedupeKey: string;
  createdAt: Date;
  deliverAt: Date;
  sentAt: Date | null;
  readAt: Date | null;
  error: string | null;
}
