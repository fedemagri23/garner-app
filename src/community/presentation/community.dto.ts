import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { additionStatus, ADDITION_STATUSES, type AdditionStatus } from '../domain/addition-status.js';
import { publicationProgress } from '../domain/store-publication.js';
import type { AddedProduct, AddedStore, ReviewItem, SimilarProduct } from '../domain/community.port.js';

const FLAG_REASONS = ['DUPLICATE', 'WRONG_INFO', 'NOT_EXIST', 'INAPPROPRIATE'] as const;

export class FlagRequest {
  @ApiProperty({ enum: FLAG_REASONS })
  @IsIn(FLAG_REASONS)
  reason!: (typeof FLAG_REASONS)[number];
}

export class ConfirmationsResponse {
  @ApiProperty({ description: 'People other than its creator who confirmed it' })
  confirmations!: number;
}

export class SuggestProductsQuery {
  @ApiProperty({ minLength: 2, maxLength: 200, example: 'leche entera' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 8 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

export class ProductSuggestionResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) brandId!: string | null;
  @ApiProperty({ type: String, nullable: true }) brandName!: string | null;
  @ApiProperty({ type: Number, nullable: true }) packageSize!: number | null;
  @ApiProperty() unit!: string;

  static from(product: SimilarProduct): ProductSuggestionResponse {
    return {
      id: product.id,
      name: product.name,
      brandId: product.brandId,
      brandName: product.brandName ?? null,
      packageSize: product.packageSize,
      unit: product.unit,
    };
  }
}

export class ReviewItemResponse {
  @ApiProperty({ enum: ['PRODUCT', 'STORE'] }) targetType!: 'PRODUCT' | 'STORE';
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['ACTIVE', 'UNDER_REVIEW', 'HIDDEN', 'MERGED'] }) moderationStatus!: string;
  @ApiProperty() flagCount!: number;
  @ApiProperty() confirmationCount!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;

  static from(item: ReviewItem): ReviewItemResponse {
    return { ...item, createdAt: item.createdAt.toISOString() };
  }
}

export class ViewerSayResponse {
  @ApiProperty({ description: 'You added it: you cannot confirm or report it' }) addedByYou!: boolean;
  @ApiProperty({ description: 'You said it exists and is right (always false for shops)' }) confirmed!: boolean;
  @ApiProperty({ description: 'You reported it' }) flagged!: boolean;
}

export class AddedProductResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) brandName!: string | null;
  @ApiProperty({ enum: ADDITION_STATUSES }) status!: AdditionStatus;
  @ApiProperty() confirmationCount!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;

  static from(product: AddedProduct): AddedProductResponse {
    return {
      id: product.id,
      name: product.name,
      brandName: product.brandName,
      status: additionStatus({ ...product, isPublic: true }),
      confirmationCount: product.confirmationCount,
      createdAt: product.createdAt.toISOString(),
    };
  }
}

export class AddedStoreResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() supermarketName!: string;
  @ApiProperty() addressLine!: string;
  @ApiProperty({ enum: ADDITION_STATUSES }) status!: AdditionStatus;
  @ApiProperty({ description: 'Distinct products with an accepted price here' }) pricedProducts!: number;
  @ApiProperty({ description: 'Still to price before everyone sees it; 0 once public' }) productsRemaining!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;

  static from(store: AddedStore): AddedStoreResponse {
    const isPublic = store.publishedAt !== null;
    return {
      id: store.id,
      name: store.name,
      supermarketName: store.supermarketName,
      addressLine: store.addressLine,
      status: additionStatus({ ...store, isPublic }),
      pricedProducts: store.pricedProductCount,
      productsRemaining: isPublic ? 0 : publicationProgress(store.pricedProductCount).productsRemaining,
      createdAt: store.createdAt.toISOString(),
    };
  }
}

export class MyAdditionsResponse {
  @ApiProperty({ type: [AddedProductResponse] }) products!: AddedProductResponse[];
  @ApiProperty({ type: [AddedStoreResponse] }) stores!: AddedStoreResponse[];
}
