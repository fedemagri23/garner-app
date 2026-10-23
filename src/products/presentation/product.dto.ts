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
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PLAIN_TEXT, PLAIN_TEXT_MESSAGE } from '../../common/text/plain-text.js';
import { PaginationQuery, PaginationMeta } from '../../common/http/pagination.js';
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

/** A category's name in the app's other languages; absent where nobody wrote one. */
export class CategoryTranslations {
  @ApiPropertyOptional({ maxLength: 80, example: 'Dairy' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  en?: string;

  @ApiPropertyOptional({ maxLength: 80, example: 'Milchprodukte' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  de?: string;

  @ApiPropertyOptional({ maxLength: 80, example: 'Laticínios' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  pt?: string;
}

/** Words a shopper may search a category by, per language. */
export class CategorySynonyms {
  @ApiPropertyOptional({ type: [String] }) es?: string[];
  @ApiPropertyOptional({ type: [String] }) en?: string[];
  @ApiPropertyOptional({ type: [String] }) de?: string[];
  @ApiPropertyOptional({ type: [String] }) pt?: string[];
}

export class CategoryResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ description: 'In Spanish' }) name!: string;
  @ApiProperty({ type: CategoryTranslations, description: 'The name in English, German and Portuguese, where written' })
  translations!: CategoryTranslations;
  @ApiProperty({ description: 'Aisle order within the parent, or among departments' }) position!: number;
  @ApiProperty({ type: CategorySynonyms, description: 'Search words per language' })
  synonyms!: CategorySynonyms;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) parentId!: string | null;

  static from(category: Category): CategoryResponse {
    return {
      id: category.id,
      name: category.name,
      translations: category.translations,
      position: category.position,
      synonyms: category.synonyms,
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
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: BrandResponse, nullable: true })
  brand!: BrandResponse | null;
  @ApiProperty({ type: CategoryResponse }) category!: CategoryResponse;
  @ApiProperty({ type: Number, nullable: true }) packageSize!: number | null;
  @ApiProperty({ enum: UNITS }) unit!: UnitOfMeasure;
  /** Pre-rendered so every client shows a package the same way. */
  @ApiProperty({ type: String, nullable: true, example: '1 L' })
  packageLabel!: string | null;
  @ApiProperty({ type: String, nullable: true }) imageUrl!: string | null;
  @ApiProperty({
    enum: ['OPEN_FOOD_FACTS'],
    nullable: true,
    description: 'Where the picture comes from when not the team’s: credit it (CC BY-SA)',
  })
  imageSource!: 'OPEN_FOOD_FACTS' | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: [ProductBarcodeResponse] })
  barcodes!: ProductBarcodeResponse[];
  @ApiProperty({
    enum: ['VERIFIED', 'COMMUNITY'],
    description: 'The team’s, or added by a shopper and not yet verified',
  })
  origin!: 'VERIFIED' | 'COMMUNITY';
  @ApiProperty({ description: 'People other than its creator who confirmed it' })
  confirmationCount!: number;
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
      imageSource: product.imageSource,
      isActive: product.isActive,
      barcodes: product.barcodes,
      origin: product.origin,
      confirmationCount: product.confirmationCount,
      createdAt: product.createdAt.toISOString(),
    };
  }
}

export class ProductPageResponse {
  @ApiProperty({ type: [ProductResponse] }) data!: ProductResponse[];
  @ApiProperty({ type: PaginationMeta }) meta!: PaginationMeta;
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
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Chosen by the client when it adds one offline; sending the same id again returns that product',
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ minLength: 2, maxLength: 200 })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  @Matches(PLAIN_TEXT, { message: PLAIN_TEXT_MESSAGE })
  name!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Matches(PLAIN_TEXT, { message: PLAIN_TEXT_MESSAGE })
  description?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  brandId?: string;

  @ApiPropertyOptional({
    minLength: 2,
    maxLength: 80,
    description: 'A brand that is not listed; ignored when `brandId` is given',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(PLAIN_TEXT, { message: PLAIN_TEXT_MESSAGE })
  brandName?: string;

  @ApiPropertyOptional({ description: 'Package size expressed in `unit`' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  packageSize?: number;

  @ApiProperty({ enum: UNITS })
  @IsEnum(UNITS)
  unit!: UnitOfMeasure;

  @ApiPropertyOptional({
    description:
      'Use the photo of the first barcode found by `/v1/product-lookup` (Open Food Facts), credited; ' +
      'the server takes it from its own lookup, never from a link',
  })
  @IsOptional()
  @IsBoolean()
  photoFromLookup?: boolean;

  @ApiPropertyOptional({ format: 'uri', description: 'Taken from the team only; ignored for shoppers' })
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

  @ApiPropertyOptional({ type: CategoryTranslations })
  @IsOptional()
  @ValidateNested()
  @Type(() => CategoryTranslations)
  translations?: CategoryTranslations;
}

export class CreateBrandRequest {
  @ApiProperty({ minLength: 2, maxLength: 80 })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;
}
