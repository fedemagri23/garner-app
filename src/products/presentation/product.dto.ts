import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQuery } from '../../common/http/pagination.js';
import type { Brand, Category, Product } from '../domain/product.entity.js';
import { formatPackageSize, UnitOfMeasure } from '../domain/unit-of-measure.js';

const UNITS = Object.values(UnitOfMeasure);

export class BrandResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;

  static from(brand: Brand): BrandResponse {
    return { id: brand.id, name: brand.name, slug: brand.slug };
  }
}

export class CategoryResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ format: 'uuid', nullable: true }) parentId!: string | null;

  static from(category: Category): CategoryResponse {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      parentId: category.parentId,
    };
  }
}

export class ProductBarcodeResponse {
  @ApiProperty() code!: string;
  @ApiProperty() isPrimary!: boolean;
}

export class ProductResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty({ type: BrandResponse, nullable: true })
  brand!: BrandResponse | null;
  @ApiProperty({ type: CategoryResponse }) category!: CategoryResponse;
  @ApiProperty({ nullable: true }) packageSize!: number | null;
  @ApiProperty({ enum: UNITS }) unit!: UnitOfMeasure;
  /** Pre-rendered so every client shows a package the same way. */
  @ApiProperty({ nullable: true, example: '1 L' })
  packageLabel!: string | null;
  @ApiProperty({ nullable: true }) imageUrl!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: [ProductBarcodeResponse] })
  barcodes!: ProductBarcodeResponse[];
  @ApiProperty({ format: 'date-time' }) createdAt!: string;

  static from(product: Product): ProductResponse {
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      brand: product.brand ? BrandResponse.from(product.brand) : null,
      category: CategoryResponse.from(product.category),
      packageSize: product.packageSize,
      unit: product.unit,
      packageLabel: formatPackageSize(product.packageSize, product.unit),
      imageUrl: product.imageUrl,
      isActive: product.isActive,
      barcodes: product.barcodes,
      createdAt: product.createdAt.toISOString(),
    };
  }
}

export class ProductPageResponse {
  @ApiProperty({ type: [ProductResponse] }) data!: ProductResponse[];
  @ApiProperty() meta!: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

/** Text search and category browsing share one query shape. */
export class SearchProductsQueryDto extends PaginationQuery {
  @ApiPropertyOptional({ description: 'Free-text search over name and brand' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Includes subcategories',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  brandId?: string;
}

export class CreateProductRequest {
  @ApiProperty({ minLength: 2, maxLength: 200 })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  brandId?: string;

  @ApiPropertyOptional({ description: 'Package size expressed in `unit`' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  packageSize?: number;

  @ApiProperty({ enum: UNITS })
  @IsEnum(UNITS)
  unit!: UnitOfMeasure;

  @ApiPropertyOptional({ format: 'uri' })
  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  imageUrl?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 10 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  barcodes?: string[];
}

export class UpdateProductRequest {
  @ApiPropertyOptional({ minLength: 2, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  brandId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  packageSize?: number;

  @ApiPropertyOptional({ enum: UNITS })
  @IsOptional()
  @IsEnum(UNITS)
  unit?: UnitOfMeasure;

  @ApiPropertyOptional({ format: 'uri' })
  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  imageUrl?: string;

  @ApiPropertyOptional({
    description:
      'Retire a product by setting this to false; products are never deleted',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AddBarcodeRequest {
  @ApiProperty({ example: '7790070410122' })
  @IsString()
  @MaxLength(32)
  code!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateCategoryRequest {
  @ApiProperty({ minLength: 2, maxLength: 80 })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class CreateBrandRequest {
  @ApiProperty({ minLength: 2, maxLength: 80 })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;
}
