import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { normalizeText, slugify } from '../../common/text/normalize.js';
import type { Brand, Category } from '../domain/product.entity.js';
import {
  BRAND_REPOSITORY,
  CATEGORY_REPOSITORY,
  type BrandRepository,
  type CategoryRepository,
} from '../domain/product.repository.port.js';

/**
 * Curated writes for the two reference lists. Slugs are derived from the name
 * rather than accepted from the caller, so the browsable url for a category is
 * a property of the catalog and not of whoever created it first.
 */
@Injectable()
export class CreateCatalogReferenceUseCase {
  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categories: CategoryRepository,
    @Inject(BRAND_REPOSITORY) private readonly brands: BrandRepository,
  ) {}

  async createCategory(input: {
    name: string;
    parentId?: string;
  }): Promise<Category> {
    const slug = slugify(input.name);

    if (await this.categories.findBySlug(slug)) {
      throw new ConflictException('A category with this name already exists');
    }

    if (input.parentId && !(await this.categories.findById(input.parentId))) {
      throw new NotFoundException('Parent category not found');
    }

    return this.categories.create({
      name: input.name.trim(),
      slug,
      parentId: input.parentId ?? null,
    });
  }

  async createBrand(input: { name: string }): Promise<Brand> {
    const slug = slugify(input.name);

    if (await this.brands.findBySlug(slug)) {
      throw new ConflictException('A brand with this name already exists');
    }

    return this.brands.create({
      name: input.name.trim(),
      normalizedName: normalizeText(input.name),
      slug,
    });
  }
}
