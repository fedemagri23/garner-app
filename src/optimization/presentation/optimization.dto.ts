import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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
} from 'class-validator';
import { PaginationQuery } from '../../common/http/pagination.js';
import type { Product } from '../../products/domain/product.entity.js';
import type { StoreLocation } from '../../supermarkets/domain/supermarket.entity.js';
import type { OptimizationView } from '../application/optimization-view.js';
import {
  OptimizationStatus,
  type OptimizationPreferences,
  type OptimizationRequest,
} from '../domain/optimization-request.entity.js';
import { MAX_STORES_HARD_LIMIT } from '../domain/optimizer.js';
import type { Plan, StorePlan } from '../domain/plan.js';
import type { RejectedPlan } from '../domain/optimizer.js';
import { OptimizationMode } from '../domain/scoring.js';

const MODES = Object.values(OptimizationMode);
const STATUSES = Object.values(OptimizationStatus);

class Names {
  constructor(
    private readonly stores: Map<string, StoreLocation>,
    private readonly products: Map<string, Product>,
  ) {}

  store(id: string): { name: string; supermarketName: string } {
    const store = this.stores.get(id);

    return {
      name: store?.name ?? 'Unknown store',
      supermarketName: store?.supermarket.name ?? 'Unknown supermarket',
    };
  }

  product(id: string): string {
    return this.products.get(id)?.name ?? 'Unknown product';
  }
}

export class PlanAssignmentResponse {
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty() productName!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty({ description: 'Derived unit price, in minor units (cents)' })
  unitPriceCents!: number;
  @ApiProperty() lineTotalCents!: number;
}

export class PlanStoreResponse {
  @ApiProperty({ description: 'Position in the route, from 1' }) order!: number;
  @ApiProperty({ format: 'uuid' }) storeId!: string;
  @ApiProperty() storeName!: string;
  @ApiProperty() supermarketName!: string;
  @ApiProperty({ type: [PlanAssignmentResponse] })
  items!: PlanAssignmentResponse[];
  @ApiProperty({ description: 'Expected spending at this store' })
  subtotalCents!: number;
}

export class PlanResponse {
  @ApiProperty({ type: [PlanStoreResponse], description: 'In route order' })
  stores!: PlanStoreResponse[];
  @ApiProperty() totalCents!: number;
  @ApiProperty({ description: 'Against shopping at one convenient store' })
  savingsCents!: number;
  @ApiProperty() additionalDistanceKm!: number;
  @ApiProperty() additionalMinutes!: number;
  @ApiProperty({ description: 'Whole trip, there and back' })
  travelDistanceKm!: number;
  @ApiProperty() travelMinutes!: number;
  @ApiProperty({ type: [String], description: 'Products this plan cannot buy' })
  missingProducts!: string[];

  static from(plan: Plan, names: Names): PlanResponse {
    return {
      stores: plan.stores.map((store) => PlanResponse.storeFrom(store, names)),
      totalCents: plan.totalCents,
      savingsCents: plan.savingsCents,
      additionalDistanceKm: plan.additionalDistanceKm,
      additionalMinutes: plan.additionalMinutes,
      travelDistanceKm: plan.travel.distanceKm,
      travelMinutes: plan.travel.minutes,
      missingProducts: plan.missingProductIds.map((id) => names.product(id)),
    };
  }

  private static storeFrom(store: StorePlan, names: Names): PlanStoreResponse {
    const { name, supermarketName } = names.store(store.storeId);

    return {
      order: store.order,
      storeId: store.storeId,
      storeName: name,
      supermarketName,
      subtotalCents: store.subtotalCents,
      items: store.assignments.map((assignment) => ({
        productId: assignment.productId,
        productName: names.product(assignment.productId),
        quantity: assignment.quantity,
        unitPriceCents: assignment.unitPriceCents,
        lineTotalCents: assignment.lineTotalCents,
      })),
    };
  }
}

export class RejectedPlanResponse {
  @ApiProperty({ type: PlanResponse }) plan!: PlanResponse;
  @ApiProperty({
    type: [String],
    description: 'Which of your limits this plan breaks',
  })
  violations!: string[];
}

export class OptimizationResultResponse {
  @ApiProperty({ type: PlanResponse, nullable: true })
  cheapest!: PlanResponse | null;
  @ApiProperty({ type: PlanResponse, nullable: true })
  bestBalance!: PlanResponse | null;
  @ApiProperty({ type: PlanResponse, nullable: true })
  simplest!: PlanResponse | null;
  @ApiProperty({
    enum: MODES,
    description: 'Which of the three this request treats as its recommendation',
  })
  recommended!: OptimizationMode;
  @ApiProperty({
    type: [RejectedPlanResponse],
    description: 'Cheaper plans that break a limit you set; never recommended',
  })
  rejectedCheaperAlternatives!: RejectedPlanResponse[];
  @ApiProperty({ type: [String], description: 'Products no nearby store sells' })
  unavailableProducts!: string[];
  @ApiProperty() consideredStoreCount!: number;
  @ApiProperty() consideredCombinationCount!: number;
}

export class OptimizationResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid', nullable: true }) listId!: string | null;
  @ApiProperty({ enum: STATUSES }) status!: OptimizationStatus;
  @ApiProperty({ enum: MODES }) mode!: OptimizationMode;
  @ApiProperty({ format: 'date-time' }) requestedAt!: string;
  @ApiProperty({ format: 'date-time', nullable: true })
  completedAt!: string | null;
  @ApiProperty({ nullable: true }) error!: string | null;
  @ApiProperty({ type: OptimizationResultResponse, nullable: true })
  result!: OptimizationResultResponse | null;

  static from(view: OptimizationView): OptimizationResponse {
    const { request } = view;
    const names = new Names(view.stores, view.products);

    return {
      id: request.id,
      listId: request.listId,
      status: request.status,
      mode: request.settings.mode,
      requestedAt: request.requestedAt.toISOString(),
      completedAt: request.completedAt?.toISOString() ?? null,
      error: request.error,
      result: request.result
        ? {
            cheapest: plan(request.result.cheapest, names),
            bestBalance: plan(request.result.bestBalance, names),
            simplest: plan(request.result.simplest, names),
            recommended: request.settings.mode,
            rejectedCheaperAlternatives:
              request.result.rejectedCheaperAlternatives.map(
                (rejected: RejectedPlan) => ({
                  plan: PlanResponse.from(rejected.plan, names),
                  violations: rejected.violations,
                }),
              ),
            unavailableProducts: request.result.unavailableProductIds.map((id) =>
              names.product(id),
            ),
            consideredStoreCount: request.result.consideredStoreCount,
            consideredCombinationCount:
              request.result.consideredCombinationCount,
          }
        : null,
    };
  }
}

/** Summary shape for listings, without the plans. */
export class OptimizationSummaryResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid', nullable: true }) listId!: string | null;
  @ApiProperty({ enum: STATUSES }) status!: OptimizationStatus;
  @ApiProperty({ enum: MODES }) mode!: OptimizationMode;
  @ApiProperty({ format: 'date-time' }) requestedAt!: string;
  @ApiProperty({ nullable: true }) recommendedTotalCents!: number | null;
  @ApiProperty({ nullable: true }) recommendedStoreCount!: number | null;

  static from(request: OptimizationRequest): OptimizationSummaryResponse {
    const recommended =
      request.result?.[
        request.settings.mode === 'CHEAPEST'
          ? 'cheapest'
          : request.settings.mode === 'SIMPLEST'
            ? 'simplest'
            : 'bestBalance'
      ] ?? null;

    return {
      id: request.id,
      listId: request.listId,
      status: request.status,
      mode: request.settings.mode,
      requestedAt: request.requestedAt.toISOString(),
      recommendedTotalCents: recommended?.totalCents ?? null,
      recommendedStoreCount: recommended?.stores.length ?? null,
    };
  }
}

export class OptimizationPageResponse {
  @ApiProperty({ type: [OptimizationSummaryResponse] })
  data!: OptimizationSummaryResponse[];
  @ApiProperty() meta!: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

function plan(value: Plan | null, names: Names): PlanResponse | null {
  return value ? PlanResponse.from(value, names) : null;
}

export class OptimizeListRequest {
  @ApiProperty({ example: -34.6037, description: 'Where the trip starts' })
  @Type(() => Number)
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ example: -58.3816 })
  @Type(() => Number)
  @IsLongitude()
  longitude!: number;

  @ApiPropertyOptional({ default: 10, maximum: 50, description: 'Stores considered within' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Max(50)
  radiusKm?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_STORES_HARD_LIMIT })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_STORES_HARD_LIMIT)
  maxStores?: number;

  @ApiPropertyOptional({ maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(50)
  maxAdditionalDistanceKm?: number;

  @ApiPropertyOptional({ maximum: 240 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  maxAdditionalMinutes?: number;

  @ApiPropertyOptional({ description: 'What an extra shop must save, in cents' })
  @IsOptional()
  @IsInt()
  @Min(0)
  minSavingsCentsPerExtraStore?: number;

  @ApiPropertyOptional({ enum: MODES })
  @IsOptional()
  @IsEnum(MODES)
  mode?: OptimizationMode;

  @ApiPropertyOptional({ type: [String], format: 'uuid', maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  preferredSupermarketIds?: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid', maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  excludedSupermarketIds?: string[];
}

export class OptimizationPreferencesResponse {
  @ApiProperty() maxStores!: number;
  @ApiProperty() maxAdditionalDistanceKm!: number;
  @ApiProperty() maxAdditionalMinutes!: number;
  @ApiProperty() minSavingsCentsPerExtraStore!: number;
  @ApiProperty({ enum: MODES }) mode!: OptimizationMode;
  @ApiProperty({ type: [String] }) preferredSupermarketIds!: string[];
  @ApiProperty({ type: [String] }) excludedSupermarketIds!: string[];

  static from(
    preferences: OptimizationPreferences,
  ): OptimizationPreferencesResponse {
    const { userId: _userId, ...rest } = preferences;
    return rest;
  }
}

export class UpdateOptimizationPreferencesRequest {
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_STORES_HARD_LIMIT })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_STORES_HARD_LIMIT)
  maxStores?: number;

  @ApiPropertyOptional({ maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(50)
  maxAdditionalDistanceKm?: number;

  @ApiPropertyOptional({ maximum: 240 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  maxAdditionalMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minSavingsCentsPerExtraStore?: number;

  @ApiPropertyOptional({ enum: MODES })
  @IsOptional()
  @IsEnum(MODES)
  mode?: OptimizationMode;

  @ApiPropertyOptional({ type: [String], format: 'uuid', maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  preferredSupermarketIds?: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid', maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  excludedSupermarketIds?: string[];
}

export class ListOptimizationsQueryDto extends PaginationQuery {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  listId?: string;
}
