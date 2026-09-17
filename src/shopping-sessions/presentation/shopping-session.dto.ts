import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationQuery } from '../../common/http/pagination.js';
import { MAX_QUANTITY } from '../../shopping-lists/domain/money.js';
import {
  ProductSummaryResponse,
  StoreSummaryResponse,
} from '../../shopping-lists/presentation/shopping-list.dto.js';
import type {
  ShoppingSessionItemView,
  ShoppingSessionView,
} from '../application/shopping-session-view.js';
import {
  ShoppingSessionStatus,
  type SessionTotals,
} from '../domain/shopping-session.entity.js';

const STATUSES = Object.values(ShoppingSessionStatus);
const MAX_PRICE_CENTS = 100_000_000;

export class SessionTotalsResponse {
  @ApiProperty({ description: 'Every line at its expected price (cents)' })
  expectedTotalCents!: number;
  @ApiProperty({
    description: 'Purchased lines, at the actual price where recorded (cents)',
  })
  actualTotalCents!: number;
  @ApiProperty({ description: 'Lines not yet purchased, at expected price (cents)' })
  remainingExpectedTotalCents!: number;
  @ApiProperty({ description: 'actual + remaining (cents)' })
  projectedTotalCents!: number;
  @ApiProperty() itemCount!: number;
  @ApiProperty() purchasedItemCount!: number;
  @ApiProperty({ description: 'Lines contributing nothing for lack of a price' })
  unpricedItemCount!: number;

  static from(totals: SessionTotals): SessionTotalsResponse {
    return { ...totals };
  }
}

export class ShoppingSessionItemResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: ProductSummaryResponse })
  product!: ProductSummaryResponse;
  @ApiProperty() quantity!: number;
  @ApiProperty({ nullable: true }) notes!: string | null;
  @ApiProperty({ nullable: true }) expectedUnitPriceCents!: number | null;
  @ApiProperty({ nullable: true }) actualUnitPriceCents!: number | null;
  @ApiProperty({ nullable: true }) expectedLineTotalCents!: number | null;
  @ApiProperty({ nullable: true }) actualLineTotalCents!: number | null;
  @ApiProperty({ type: StoreSummaryResponse, nullable: true })
  store!: StoreSummaryResponse | null;
  @ApiProperty() isPurchased!: boolean;
  @ApiProperty({ format: 'date-time', nullable: true })
  purchasedAt!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true })
  sourceListItemId!: string | null;

  static from(view: ShoppingSessionItemView): ShoppingSessionItemResponse {
    const { item } = view;

    return {
      id: item.id,
      product: ProductSummaryResponse.from(view.product),
      quantity: item.quantity,
      notes: item.notes,
      expectedUnitPriceCents: item.expectedUnitPriceCents,
      actualUnitPriceCents: item.actualUnitPriceCents,
      expectedLineTotalCents: view.expectedLineTotalCents,
      actualLineTotalCents: view.actualLineTotalCents,
      store: view.store ? StoreSummaryResponse.from(view.store) : null,
      isPurchased: item.isPurchased,
      purchasedAt: item.purchasedAt?.toISOString() ?? null,
      sourceListItemId: item.sourceListItemId,
    };
  }
}

export class ShoppingSessionSummaryResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid', nullable: true, description: 'Null once the list is deleted' })
  listId!: string | null;
  @ApiProperty() listName!: string;
  @ApiProperty() currency!: string;
  @ApiProperty({ enum: STATUSES }) status!: ShoppingSessionStatus;
  @ApiProperty({ type: StoreSummaryResponse, nullable: true })
  store!: StoreSummaryResponse | null;
  @ApiProperty({ type: SessionTotalsResponse }) totals!: SessionTotalsResponse;
  @ApiProperty({ format: 'date-time' }) startedAt!: string;
  @ApiProperty({ format: 'date-time', nullable: true }) pausedAt!: string | null;
  @ApiProperty({ format: 'date-time', nullable: true })
  completedAt!: string | null;
  @ApiProperty({ format: 'date-time', nullable: true })
  abandonedAt!: string | null;

  static from(view: ShoppingSessionView): ShoppingSessionSummaryResponse {
    const { session } = view;

    return {
      id: session.id,
      listId: session.listId,
      listName: session.listName,
      currency: session.currency,
      status: session.status,
      store: view.store ? StoreSummaryResponse.from(view.store) : null,
      totals: SessionTotalsResponse.from(view.totals),
      startedAt: session.startedAt.toISOString(),
      pausedAt: session.pausedAt?.toISOString() ?? null,
      completedAt: session.completedAt?.toISOString() ?? null,
      abandonedAt: session.abandonedAt?.toISOString() ?? null,
    };
  }
}

export class ShoppingSessionDetailResponse extends ShoppingSessionSummaryResponse {
  @ApiProperty({ type: [ShoppingSessionItemResponse] })
  items!: ShoppingSessionItemResponse[];

  static fromView(view: ShoppingSessionView): ShoppingSessionDetailResponse {
    return {
      ...ShoppingSessionSummaryResponse.from(view),
      items: view.items.map(ShoppingSessionItemResponse.from),
    };
  }
}

export class ShoppingSessionPageResponse {
  @ApiProperty({ type: [ShoppingSessionSummaryResponse] })
  data!: ShoppingSessionSummaryResponse[];
  @ApiProperty() meta!: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export class ListShoppingSessionsQueryDto extends PaginationQuery {
  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsEnum(STATUSES)
  status?: ShoppingSessionStatus;
}

export class StartShoppingSessionRequest {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Optional client-generated id. Retrying with the same id returns the ' +
      'session already started.',
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  listId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'The store being shopped; applies to every line of the trip',
  })
  @IsOptional()
  @IsUUID()
  storeId?: string;
}

export class RecordItemProgressRequest {
  @ApiPropertyOptional({ maximum: MAX_QUANTITY })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Max(MAX_QUANTITY)
  quantity?: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'What was paid per unit, in cents. Null clears it.',
  })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_CENTS)
  actualUnitPriceCents?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPurchased?: boolean;

  @ApiPropertyOptional({
    format: 'date-time',
    description:
      'When the shopper marked the item, from the device clock. Lets an ' +
      'offline client report the real moment rather than the sync time.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  purchasedAt?: Date;
}
