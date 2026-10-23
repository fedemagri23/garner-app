import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import type { Language } from '../../common/i18n/language.js';
import { isValidBarcode, normalizeBarcode } from '../domain/barcode.js';
import {
  categoryForTags,
  chooseBrand,
  chooseName,
  parseQuantity,
  PRODUCT_FACTS_SOURCE,
  type ProductFacts,
  type ProductFactsSource,
} from '../domain/product-facts.js';
import {
  CATEGORY_REPOSITORY,
  PRODUCT_REPOSITORY,
  type CategoryRepository,
  type ProductRepository,
} from '../domain/product.repository.port.js';
import type { UnitOfMeasure } from '../domain/unit-of-measure.js';

export type BarcodeLookup =
  /** Already in Garner: open it rather than add it again. */
  | { match: 'CATALOG'; productId: string; name: string }
  /** Known to Open Food Facts: a starting point for "Agregar producto". */
  | {
      match: 'OPEN_FOOD_FACTS';
      name: string;
      brandName: string | null;
      packageSize: number | null;
      unit: UnitOfMeasure | null;
      categoryId: string | null;
      imageUrl: string | null;
      sourceUrl: string;
    }
  | { match: 'NONE' };

/**
 * What a scanned code is, for a shopper about to add it: ours already, or
 * what Open Food Facts knows of it, turned into our fields. Never an error
 * the form has to handle — an outside service that is down or slow means
 * there is nothing to suggest, and the shopper types.
 */
@Injectable()
export class LookUpBarcodeUseCase {
  private readonly logger = new Logger(LookUpBarcodeUseCase.name);

  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(CATEGORY_REPOSITORY) private readonly categories: CategoryRepository,
    @Inject(PRODUCT_FACTS_SOURCE) private readonly facts: ProductFactsSource,
  ) {}

  async execute(rawCode: string, language: Language): Promise<BarcodeLookup> {
    if (!isValidBarcode(rawCode)) {
      throw new BadRequestException('Not a valid barcode');
    }
    const code = normalizeBarcode(rawCode);

    const ours = await this.products.findByBarcode(code);
    if (ours) {
      return { match: 'CATALOG', productId: ours.id, name: ours.name };
    }

    const facts = await this.factsFor(code);
    const name = facts ? chooseName(facts, language) : null;
    if (!facts || !name) {
      return { match: 'NONE' };
    }

    const size = parseQuantity(facts.quantity);
    const category = categoryForTags(await this.categories.findAll(), facts.categoryTags);

    return {
      match: 'OPEN_FOOD_FACTS',
      name,
      brandName: chooseBrand(facts),
      packageSize: size?.packageSize ?? null,
      unit: size?.unit ?? null,
      categoryId: category?.id ?? null,
      imageUrl: facts.imageUrl,
      sourceUrl: `https://world.openfoodfacts.org/product/${code}`,
    };
  }

  /** What Open Food Facts knows of a code, or null — including when it could not be asked. */
  async factsFor(code: string): Promise<ProductFacts | null> {
    try {
      return await this.facts.find(code);
    } catch (error) {
      this.logger.warn(`Barcode lookup failed for ${code}: ${(error as Error).message}`);
      return null;
    }
  }
}
