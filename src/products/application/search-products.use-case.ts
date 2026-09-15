import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { normalizeText } from '../../common/text/normalize.js';
import type { Product } from '../domain/product.entity.js';
import {
  CATEGORY_REPOSITORY,
  PRODUCT_REPOSITORY,
  type CategoryRepository,
  type ProductRepository,
} from '../domain/product.repository.port.js';

export interface SearchProductsQuery {
  term?: string;
  categoryId?: string;
  brandId?: string;
  skip: number;
  take: number;
}

export interface SearchProductsResult {
  products: Product[];
  totalItems: number;
}

/**
 * Text search and category browsing are the same read with different filters,
 * so they are one use case rather than two nearly identical ones.
 */
@Injectable()
export class SearchProductsUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(CATEGORY_REPOSITORY)
    private readonly categories: CategoryRepository,
  ) {}

  async execute(query: SearchProductsQuery): Promise<SearchProductsResult> {
    // Browsing a parent category has to return what is filed under its
    // children too, or "Dairy" looks empty while "Dairy → Milk" is full.
    let categoryIds: string[] | undefined;

    if (query.categoryId) {
      const category = await this.categories.findById(query.categoryId);

      if (!category) {
        throw new NotFoundException('Category not found');
      }

      categoryIds = await this.categories.findSubtreeIds(category.id);
    }

    const term = query.term ? normalizeText(query.term) : undefined;

    return this.products.search({
      term: term || undefined,
      categoryIds,
      brandId: query.brandId,
      skip: query.skip,
      take: query.take,
    });
  }
}
