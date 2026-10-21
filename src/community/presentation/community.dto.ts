import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { ReviewItem, SimilarProduct } from '../domain/community.port.js';

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
  @ApiProperty({ type: Number, nullable: true }) packageSize!: number | null;
  @ApiProperty() unit!: string;

  static from(product: SimilarProduct): ProductSuggestionResponse {
    return {
      id: product.id,
      name: product.name,
      brandId: product.brandId,
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
