import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { LANGUAGES, type Language } from '../../common/i18n/language.js';
import type { BarcodeLookup } from '../application/look-up-barcode.use-case.js';
import { PRODUCT_LABELS, type ProductLabel } from '../domain/product-label.js';
import { UnitOfMeasure } from '../domain/unit-of-measure.js';

export class BarcodeLookupQuery {
  @ApiPropertyOptional({ enum: LANGUAGES, default: 'es', description: 'Which of the product’s names to prefer' })
  @IsOptional()
  @IsIn(LANGUAGES)
  language?: Language;
}

/** Flat on purpose: one shape for the three answers, the fields that do not apply null. */
export class BarcodeLookupResponse {
  @ApiProperty({ enum: ['CATALOG', 'OPEN_FOOD_FACTS', 'NONE'] }) match!: BarcodeLookup['match'];
  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'CATALOG only' })
  productId!: string | null;
  @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @ApiProperty({ type: String, nullable: true }) brandName!: string | null;
  @ApiProperty({ type: Number, nullable: true }) packageSize!: number | null;
  @ApiProperty({ enum: Object.values(UnitOfMeasure), nullable: true }) unit!: UnitOfMeasure | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Ours, mapped from their categories' })
  categoryId!: string | null;
  @ApiProperty({ enum: PRODUCT_LABELS, isArray: true, description: 'Labels Open Food Facts gives it' })
  labels!: ProductLabel[];
  @ApiProperty({ type: String, nullable: true, description: 'Their front photo (CC BY-SA): credit it' })
  imageUrl!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'The product’s page there, for the credit' })
  sourceUrl!: string | null;

  static from(lookup: BarcodeLookup): BarcodeLookupResponse {
    const empty = {
      productId: null,
      name: null,
      brandName: null,
      packageSize: null,
      unit: null,
      categoryId: null,
      labels: [],
      imageUrl: null,
      sourceUrl: null,
    };
    if (lookup.match === 'CATALOG') return { ...empty, match: 'CATALOG', productId: lookup.productId, name: lookup.name };
    if (lookup.match === 'NONE') return { ...empty, match: 'NONE' };
    return { ...lookup, productId: null };
  }
}
