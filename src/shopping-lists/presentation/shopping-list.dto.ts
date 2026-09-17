import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQuery } from '../../common/http/pagination.js';
import type { Product } from '../../products/domain/product.entity.js';
import { formatPackageSize } from '../../products/domain/unit-of-measure.js';
import type { StoreLocation } from '../../supermarkets/domain/supermarket.entity.js';
import type {
  ShoppingListItemView,
  ShoppingListView,
} from '../application/shopping-list-view.js';
import type { ShoppingListSummary } from '../application/manage-shopping-lists.use-case.js';
import { MAX_QUANTITY } from '../domain/money.js';
import {
  MAX_ITEMS_PER_LIST,
  ShoppingListSortMode,
  type ShoppingListTotals,
} from '../domain/shopping-list.entity.js';

const SORT_MODES = Object.values(ShoppingListSortMode);

/** Cents are bounded well above any grocery price, below Postgres `integer`. */
const MAX_PRICE_CENTS = 100_000_000;

/** The slice of a product a list or trip shows next to each line. */
export class ProductSummaryResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) brandName!: string | null;
  @ApiProperty() categoryName!: string;
  @ApiProperty({ nullable: true, example: '1 L' }) packageLabel!: string | null;
  @ApiProperty({ nullable: true }) imageUrl!: string | null;

  static from(product: Product): ProductSummaryResponse {
    return {
      id: product.id,
      name: product.name,
      brandName: product.brand?.name ?? null,
      categoryName: product.category.name,
      packageLabel: formatPackageSize(product.packageSize, product.unit),
      imageUrl: product.imageUrl,
    };
  }
}

export class StoreSummaryResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() supermarketName!: string;

  static from(store: StoreLocation): StoreSummaryResponse {
    return {
      id: store.id,
      name: store.name,
      supermarketName: store.supermarket.name,
    };
  }
}

export class ShoppingListTotalsResponse {
  @ApiProperty({ description: 'Minor units (cents)' })
  expectedTotalCents!: number;
  @ApiProperty() itemCount!: number;
  @ApiProperty({
    description:
      'Items with no expected price; when non-zero the total is a lower bound',
  })
  unpricedItemCount!: number;

  static from(totals: ShoppingListTotals): ShoppingListTotalsResponse {
    return { ...totals };
  }
}

export class ShoppingListItemResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: ProductSummaryResponse })
  product!: ProductSummaryResponse;
  @ApiProperty({ example: 1.5 }) quantity!: number;
  @ApiProperty({ nullable: true }) notes!: string | null;
  @ApiProperty({ nullable: true, description: 'Minor units (cents)' })
  expectedUnitPriceCents!: number | null;
  @ApiProperty({ nullable: true, description: 'quantity × unit price, rounded' })
  expectedLineTotalCents!: number | null;
  @ApiProperty({ type: StoreSummaryResponse, nullable: true })
  selectedStore!: StoreSummaryResponse | null;
  @ApiProperty() position!: number;

  static from(view: ShoppingListItemView): ShoppingListItemResponse {
    return {
      id: view.item.id,
      product: ProductSummaryResponse.from(view.product),
      quantity: view.item.quantity,
      notes: view.item.notes,
      expectedUnitPriceCents: view.item.expectedUnitPriceCents,
      expectedLineTotalCents: view.expectedLineTotalCents,
      selectedStore: view.store ? StoreSummaryResponse.from(view.store) : null,
      position: view.item.position,
    };
  }
}

export class ShoppingListSummaryResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) notes!: string | null;
  @ApiProperty({ example: 'ARS' }) currency!: string;
  @ApiProperty({ enum: SORT_MODES }) sortMode!: ShoppingListSortMode;
  @ApiProperty({ type: ShoppingListTotalsResponse })
  totals!: ShoppingListTotalsResponse;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;

  static from(summary: ShoppingListSummary): ShoppingListSummaryResponse {
    const { list, totals } = summary;

    return {
      id: list.id,
      name: list.name,
      notes: list.notes,
      currency: list.currency,
      sortMode: list.sortMode,
      totals: ShoppingListTotalsResponse.from(totals),
      createdAt: list.createdAt.toISOString(),
      updatedAt: list.updatedAt.toISOString(),
    };
  }
}

export class ShoppingListDetailResponse extends ShoppingListSummaryResponse {
  @ApiProperty({
    type: [ShoppingListItemResponse],
    description: 'Ordered by the list sort mode',
  })
  items!: ShoppingListItemResponse[];

  static fromView(view: ShoppingListView): ShoppingListDetailResponse {
    return {
      ...ShoppingListSummaryResponse.from(view),
      items: view.items.map(ShoppingListItemResponse.from),
    };
  }
}

export class ShoppingListPageResponse {
  @ApiProperty({ type: [ShoppingListSummaryResponse] })
  data!: ShoppingListSummaryResponse[];
  @ApiProperty() meta!: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export class ListShoppingListsQueryDto extends PaginationQuery {}

const CLIENT_ID_DESCRIPTION =
  'Optional client-generated id. Retrying with the same id returns the ' +
  'existing resource instead of creating a duplicate.';

export class CreateShoppingListRequest {
  @ApiPropertyOptional({ format: 'uuid', description: CLIENT_ID_DESCRIPTION })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ minLength: 1, maxLength: 120, example: 'Weekly groceries' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiProperty({ example: 'ARS', description: 'ISO 4217; fixed once the list exists' })
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be an ISO 4217 code' })
  currency!: string;

  @ApiPropertyOptional({ enum: SORT_MODES, default: 'MANUAL' })
  @IsOptional()
  @IsEnum(SORT_MODES)
  sortMode?: ShoppingListSortMode;
}

export class UpdateShoppingListRequest {
  @ApiPropertyOptional({ minLength: 1, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 1000 })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  @ApiPropertyOptional({ enum: SORT_MODES })
  @IsOptional()
  @IsEnum(SORT_MODES)
  sortMode?: ShoppingListSortMode;
}

export class DuplicateShoppingListRequest {
  @ApiPropertyOptional({ format: 'uuid', description: CLIENT_ID_DESCRIPTION })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 120,
    description: 'Defaults to the original name with " (copy)"',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;
}

export class AddShoppingListItemRequest {
  @ApiPropertyOptional({ format: 'uuid', description: CLIENT_ID_DESCRIPTION })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: 1, maximum: MAX_QUANTITY })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Max(MAX_QUANTITY)
  quantity!: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ description: 'Minor units (cents)', example: 125 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_CENTS)
  expectedUnitPriceCents?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  selectedStoreId?: string;
}

export class UpdateShoppingListItemRequest {
  @ApiPropertyOptional({ maximum: MAX_QUANTITY })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Max(MAX_QUANTITY)
  quantity?: number;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Minor units (cents)' })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_CENTS)
  expectedUnitPriceCents?: number | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  selectedStoreId?: string | null;
}

export class ReorderShoppingListItemsRequest {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Every item id of the list, exactly once, in the new order',
  })
  @IsArray()
  @ArrayMaxSize(MAX_ITEMS_PER_LIST)
  @IsUUID('all', { each: true })
  itemIds!: string[];
}
