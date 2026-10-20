import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  Matches,
  IsPositive,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationQuery, PaginationMeta } from '../../common/http/pagination.js';
import type { SubjectNames } from '../application/notification-names.js';
import {
  NotificationCategory,
  NotificationStatus,
  PriceAlertType,
  type Notification,
  type NotificationPreferences,
  type PriceAlert,
} from '../domain/price-alert.entity.js';

const ALERT_TYPES = Object.values(PriceAlertType);
const CATEGORIES = Object.values(NotificationCategory);
const STATUSES = Object.values(NotificationStatus);

const MAX_PRICE_CENTS = 100_000_000;

export class PriceAlertResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty() productName!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Null when the alert watches anywhere nearby' })
  storeName!: string | null;
  @ApiProperty({ type: String, nullable: true }) supermarketName!: string | null;
  @ApiProperty({ enum: ALERT_TYPES }) type!: PriceAlertType;
  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Null watches anywhere nearby' })
  storeId!: string | null;
  @ApiProperty({ type: Number, nullable: true }) thresholdCents!: number | null;
  @ApiProperty({ type: Number, nullable: true }) dropPercent!: number | null;
  @ApiProperty({ type: Number, nullable: true }) radiusKm!: number | null;
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'ARS',
    description: 'What thresholdCents is in; null on alerts made before it was recorded',
  })
  currency!: string | null;
  @ApiProperty() isEnabled!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastTriggeredAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;

  static from(alert: PriceAlert, names: SubjectNames): PriceAlertResponse {
    return {
      id: alert.id,
      productId: alert.productId,
      productName: names.productName ?? 'Unknown product',
      storeName: names.storeName,
      supermarketName: names.supermarketName,
      type: alert.type,
      storeId: alert.storeId,
      thresholdCents: alert.thresholdCents,
      dropPercent: alert.dropPercent,
      radiusKm: alert.radiusKm,
      currency: alert.currency,
      isEnabled: alert.isEnabled,
      lastTriggeredAt: alert.lastTriggeredAt?.toISOString() ?? null,
      createdAt: alert.createdAt.toISOString(),
    };
  }
}

export class PriceAlertPageResponse {
  @ApiProperty({ type: [PriceAlertResponse] }) data!: PriceAlertResponse[];
  @ApiProperty({ type: PaginationMeta }) meta!: PaginationMeta;
}

export class NotificationResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: CATEGORIES }) category!: NotificationCategory;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) productId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) storeId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) listId!: string | null;
  @ApiProperty({ type: String, nullable: true }) productName!: string | null;
  @ApiProperty({ type: String, nullable: true }) storeName!: string | null;
  @ApiProperty({ type: String, nullable: true }) supermarketName!: string | null;
  @ApiProperty({
    enum: ALERT_TYPES,
    nullable: true,
    description: 'For a price alert, why it fired — so a client can say it in its own language',
  })
  reason!: PriceAlertType | null;
  @ApiProperty({ type: Number, nullable: true, description: 'The price that fired it, in minor units' })
  priceCents!: number | null;
  @ApiProperty({ type: Number, nullable: true, description: 'The price before it, in minor units' })
  previousPriceCents!: number | null;
  @ApiProperty({ type: String, nullable: true, example: 'ARS' }) currency!: string | null;
  @ApiProperty({ enum: STATUSES }) status!: NotificationStatus;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) readAt!: string | null;

  static from(notification: Notification, names: SubjectNames): NotificationResponse {
    return {
      id: notification.id,
      category: notification.category,
      title: notification.title,
      body: notification.body,
      productId: notification.productId,
      storeId: notification.storeId,
      listId: notification.listId,
      ...names,
      reason: notification.reason,
      priceCents: notification.priceCents,
      previousPriceCents: notification.previousPriceCents,
      currency: notification.currency,
      status: notification.status,
      createdAt: notification.createdAt.toISOString(),
      readAt: notification.readAt?.toISOString() ?? null,
    };
  }
}

export class NotificationPageResponse {
  @ApiProperty({ type: [NotificationResponse] }) data!: NotificationResponse[];
  @ApiProperty({ description: 'Messages not yet marked read' })
  unreadCount!: number;
  @ApiProperty({ type: PaginationMeta }) meta!: PaginationMeta;
}

export class CreatePriceAlertRequest {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ enum: ALERT_TYPES })
  @IsEnum(ALERT_TYPES)
  type!: PriceAlertType;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Watch one store; omit to watch anywhere nearby',
  })
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiPropertyOptional({ description: 'BELOW_THRESHOLD: the figure, in cents' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PRICE_CENTS)
  thresholdCents?: number;

  @ApiPropertyOptional({ description: 'PRICE_DROP: how big a fall is worth hearing about' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  dropPercent?: number;

  @ApiPropertyOptional({ description: 'CHEAPER_NEARBY: where nearby is measured from' })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Max(50)
  radiusKm?: number;

  @ApiPropertyOptional({
    example: 'ARS',
    description:
      'What thresholdCents is in. Prices in another currency never match; omitted, any does',
  })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be an ISO 4217 code' })
  currency?: string;
}

export class UpdatePriceAlertRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PRICE_CENTS)
  thresholdCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  dropPercent?: number;
}

export class NotificationPreferencesResponse {
  @ApiProperty() priceAlertsEnabled!: boolean;
  @ApiProperty() remindersEnabled!: boolean;
  @ApiProperty({ type: Number, nullable: true, minimum: 0, maximum: 23 })
  quietHoursStartUtc!: number | null;
  @ApiProperty({ type: Number, nullable: true, minimum: 0, maximum: 23 })
  quietHoursEndUtc!: number | null;
  @ApiProperty({ description: 'The least time between two messages from one alert' })
  minMinutesBetweenAlerts!: number;
  @ApiProperty({ description: 'Whether alerts are also emailed. Off until turned on.' })
  emailEnabled!: boolean;
  @ApiProperty({ description: 'Whether this server can send email at all' })
  emailAvailable!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  emailOptedInAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  emailOptedOutAt!: string | null;

  static from(
    preferences: NotificationPreferences,
    emailAvailable: boolean,
  ): NotificationPreferencesResponse {
    const { userId: _userId, emailOptedInAt, emailOptedOutAt, ...rest } =
      preferences;

    return {
      ...rest,
      emailAvailable,
      emailOptedInAt: emailOptedInAt?.toISOString() ?? null,
      emailOptedOutAt: emailOptedOutAt?.toISOString() ?? null,
    };
  }
}

export class UpdateNotificationPreferencesRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  priceAlertsEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Also email alerts to the account address. Recorded as consent.',
  })
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  remindersEnabled?: boolean;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: 23,
    description: 'Set with quietHoursEndUtc, or null to be reachable always',
  })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(23)
  quietHoursStartUtc?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0, maximum: 23 })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(23)
  quietHoursEndUtc?: number | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 10_080 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_080)
  minMinutesBetweenAlerts?: number;
}

export class ListNotificationsQueryDto extends PaginationQuery {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unreadOnly?: boolean;
}

export class ListPriceAlertsQueryDto extends PaginationQuery {}
