import { Inject, Injectable } from '@nestjs/common';
import type { Brand, Category } from '../domain/product.entity.js';
import {
  BRAND_REPOSITORY,
  CATEGORY_REPOSITORY,
  type BrandRepository,
  type CategoryRepository,
} from '../domain/product.repository.port.js';

/** The two small reference lists the search UI needs to offer filters. */
@Injectable()
export class BrowseCatalogUseCase {
  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categories: CategoryRepository,
    @Inject(BRAND_REPOSITORY) private readonly brands: BrandRepository,
  ) {}

  listCategories(): Promise<Category[]> {
    return this.categories.findAll();
  }

  listBrands(): Promise<Brand[]> {
    return this.brands.findAll();
  }
}
