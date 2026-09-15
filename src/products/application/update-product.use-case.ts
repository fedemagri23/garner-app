import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  normalizeProductName,
  type Product,
  type UpdateProductInput,
} from '../domain/product.entity.js';
import {
  BRAND_REPOSITORY,
  CATEGORY_REPOSITORY,
  PRODUCT_REPOSITORY,
  type BrandRepository,
  type CategoryRepository,
  type ProductRepository,
} from '../domain/product.repository.port.js';
import type { UnitOfMeasure } from '../domain/unit-of-measure.js';

export interface UpdateProductCommand {
  name?: string;
  description?: string | null;
  categoryId?: string;
  brandId?: string | null;
  packageSize?: number | null;
  unit?: UnitOfMeasure;
  imageUrl?: string | null;
  isActive?: boolean;
}

/**
 * Corrects an existing product in place. The product keeps its id through any
 * correction — that is the whole point of a canonical catalog, since every
 * price observation ever recorded points at that id.
 */
@Injectable()
export class UpdateProductUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(CATEGORY_REPOSITORY)
    private readonly categories: CategoryRepository,
    @Inject(BRAND_REPOSITORY) private readonly brands: BrandRepository,
  ) {}

  async execute(id: string, command: UpdateProductCommand): Promise<Product> {
    const existing = await this.products.findById(id);
    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    if (
      command.categoryId &&
      !(await this.categories.findById(command.categoryId))
    ) {
      throw new NotFoundException('Category not found');
    }

    if (command.brandId && !(await this.brands.findById(command.brandId))) {
      throw new NotFoundException('Brand not found');
    }

    const input: UpdateProductInput = {
      description: command.description,
      categoryId: command.categoryId,
      brandId: command.brandId,
      packageSize: command.packageSize,
      unit: command.unit,
      imageUrl: command.imageUrl,
      isActive: command.isActive,
    };

    if (command.name !== undefined) {
      input.name = command.name.trim();
      // The matching key is derived, never supplied, so it cannot drift away
      // from the display name.
      input.normalizedName = normalizeProductName(command.name);
    }

    return this.products.update(id, input);
  }
}
