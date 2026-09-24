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
  IsPositive,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationQuery } from '../../common/http/pagination.js';
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
  @ApiProperty({ enum: ALERT_TYPES }) type!: PriceAlertType;
  @ApiProperty({ format: 'uuid', nullable: true, description: 'Null watches anywhere nearby' })
  storeId!: string | null;
  @ApiProperty({ nullable: true }) thresholdCents!: number | null;
  @ApiProperty({ nullable: true }) dropPercent!: number | null;
  @ApiProperty({ nullable: true }) radiusKm!: number | null;
  @ApiProperty() isEnabled!: boolean;
  @ApiProperty({ format: 'date-time', nullable: true })
  lastTriggeredAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;

  static from(alert: PriceAlert): PriceAlertResponse {
    return {
      id: alert.id,
      productId: alert.productId,
      type: alert.type,
      storeId: alert.storeId,
      thresholdCents: alert.thresholdCents,
      dropPercent: alert.dropPercent,
      radiusKm: alert.radiusKm,
      isEnabled: alert.isEnabled,
      lastTriggeredAt: alert.lastTriggeredAt?.toISOString() ?? null,
      createdAt: alert.createdAt.toISOString(),
    };
  }
}

export class PriceAlertPageResponse {
  @ApiProperty({ type: [PriceAlertResponse] }) data!: PriceAlertResponse[];
  @ApiProperty() meta!: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export class NotificationResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: CATEGORIES }) category!: NotificationCategory;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ format: 'uuid', nullable: true }) productId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) storeId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) listId!: string | null;
  @ApiProperty({ enum: STATUSES }) status!: NotificationStatus;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time', nullable: true }) readAt!: string | null;

  static from(notification: Notification): NotificationResponse {
    return {
      id: notification.id,
      category: notification.category,
      title: notification.title,
      body: notification.body,
      productId: notification.productId,
      storeId: notification.storeId,
      listId: notification.listId,
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
  @ApiProperty() meta!: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
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
  @ApiProperty({ nullable: true, minimum: 0, maximum: 23 })
  quietHoursStartUtc!: number | null;
  @ApiProperty({ nullable: true, minimum: 0, maximum: 23 })
  quietHoursEndUtc!: number | null;
  @ApiProperty({ description: 'The least time between two messages from one alert' })
  minMinutesBetweenAlerts!: number;

  static from(
    preferences: NotificationPreferences,
  ): NotificationPreferencesResponse {
    const { userId: _userId, ...rest } = preferences;
    return rest;
  }
}

export class UpdateNotificationPreferencesRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  priceAlertsEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  remindersEnabled?: boolean;

  @ApiPropertyOptional({
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

  @ApiPropertyOptional({ nullable: true, minimum: 0, maximum: 23 })
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
