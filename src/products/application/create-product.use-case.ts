import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isValidBarcode, normalizeBarcode } from '../domain/barcode.js';
import {
  normalizeProductName,
  type Product,
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

export interface CreateProductCommand {
  name: string;
  description?: string;
  categoryId: string;
  brandId?: string;
  packageSize?: number;
  unit: UnitOfMeasure;
  imageUrl?: string;
  barcodes?: string[];
}

/**
 * Creating catalog entries is a curated operation, not something a shopper
 * does — the controller restricts it to moderators and administrators. The
 * checks here are about identity: a product must land in a real category and,
 * if it carries barcodes, they must be well-formed and unclaimed.
 */
@Injectable()
export class CreateProductUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(CATEGORY_REPOSITORY)
    private readonly categories: CategoryRepository,
    @Inject(BRAND_REPOSITORY) private readonly brands: BrandRepository,
  ) {}

  async execute(command: CreateProductCommand): Promise<Product> {
    const category = await this.categories.findById(command.categoryId);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (command.brandId && !(await this.brands.findById(command.brandId))) {
      throw new NotFoundException('Brand not found');
    }

    const codes = (command.barcodes ?? []).map(normalizeBarcode);

    for (const code of codes) {
      if (!isValidBarcode(code)) {
        throw new BadRequestException(`Not a valid barcode: ${code}`);
      }

      const owner = await this.products.findByBarcode(code);
      if (owner) {
        // A barcode identifies one product; handing it to a second one would
        // split that product's price history in two.
        throw new ConflictException(
          `Barcode ${code} already belongs to another product`,
        );
      }
    }

    const product = await this.products.create({
      name: command.name.trim(),
      normalizedName: normalizeProductName(command.name),
      description: command.description?.trim() ?? null,
      brandId: command.brandId ?? null,
      categoryId: command.categoryId,
      packageSize: command.packageSize ?? null,
      unit: command.unit,
      imageUrl: command.imageUrl ?? null,
    });

    let created = product;
    for (const [index, code] of codes.entries()) {
      const updated = await this.products.addBarcode(
        product.id,
        code,
        index === 0,
      );

      if (!updated) {
        throw new ConflictException(
          `Barcode ${code} already belongs to another product`,
        );
      }

      created = updated;
    }

    return created;
  }
}
