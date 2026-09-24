import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/core/index.js';
import { CorePrismaService } from '../../common/database/core-prisma.service.js';
import type {
  CreateProductInput,
  Product,
  UpdateProductInput,
} from '../domain/product.entity.js';
import type {
  ProductRepository,
  ProductSearchCriteria,
  ProductSearchResult,
} from '../domain/product.repository.port.js';
import type { UnitOfMeasure } from '../domain/unit-of-measure.js';

/** A product row with everything the domain entity needs joined in. */
const PRODUCT_INCLUDE = {
  brand: true,
  category: true,
  barcodes: { orderBy: { isPrimary: 'desc' } },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

/**
 * The only code that reads or writes the catalog tables. Prisma row shapes and
 * `Decimal` stop here; callers receive domain entities with plain numbers.
 */
@Injectable()
export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly prisma: CorePrismaService) {}

  async search(criteria: ProductSearchCriteria): Promise<ProductSearchResult> {
    const where = this.buildWhere(criteria);

    // One round trip for the page and one for the count: the total is what
    // lets a client render "page 3 of 12" without walking every page.
    const [rows, totalItems] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: [{ normalizedName: 'asc' }, { id: 'asc' }],
        skip: criteria.skip,
        take: criteria.take,
      }),
      this.prisma.product.count({ where }),
    ]);

    return { products: rows.map((row) => this.toDomain(row)), totalItems };
  }

  async findById(id: string): Promise<Product | null> {
    const row = await this.prisma.product.findUnique({
      where: { id },
      include: PRODUCT_INCLUDE,
    });

    return row ? this.toDomain(row) : null;
  }

  async findManyByIds(ids: string[]): Promise<Product[]> {
    if (ids.length === 0) {
      return [];
    }

    const rows = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: PRODUCT_INCLUDE,
    });

    return rows.map((row) => this.toDomain(row));
  }

  async findByBarcode(code: string): Promise<Product | null> {
    const barcode = await this.prisma.productBarcode.findUnique({
      where: { code },
      include: { product: { include: PRODUCT_INCLUDE } },
    });

    return barcode ? this.toDomain(barcode.product) : null;
  }

  async findByNormalizedName(normalizedName: string): Promise<Product[]> {
    const rows = await this.prisma.product.findMany({
      where: { normalizedName, isActive: true },
      include: PRODUCT_INCLUDE,
      // Bounded: more than a handful of products sharing one name is a
      // catalog problem, and the matcher refuses ambiguity anyway.
      take: 10,
    });

    return rows.map((row) => this.toDomain(row));
  }

  async create(input: CreateProductInput): Promise<Product> {
    const row = await this.prisma.product.create({
      data: {
        name: input.name,
        normalizedName: input.normalizedName,
        description: input.description,
        brandId: input.brandId,
        categoryId: input.categoryId,
        packageSize: input.packageSize,
        unit: input.unit,
        imageUrl: input.imageUrl,
      },
      include: PRODUCT_INCLUDE,
    });

    return this.toDomain(row);
  }

  async update(id: string, input: UpdateProductInput): Promise<Product> {
    const row = await this.prisma.product.update({
      where: { id },
      // Undefined fields are left untouched by Prisma, which is exactly the
      // PATCH semantics the controller promises.
      data: {
        name: input.name,
        normalizedName: input.normalizedName,
        description: input.description,
        brandId: input.brandId,
        categoryId: input.categoryId,
        packageSize: input.packageSize,
        unit: input.unit,
        imageUrl: input.imageUrl,
        isActive: input.isActive,
      },
      include: PRODUCT_INCLUDE,
    });

    return this.toDomain(row);
  }

  async addBarcode(
    productId: string,
    code: string,
    isPrimary: boolean,
  ): Promise<Product | null> {
    const existing = await this.prisma.productBarcode.findUnique({
      where: { code },
    });

    if (existing && existing.productId !== productId) {
      return null;
    }

    await this.prisma.$transaction(async (tx) => {
      if (isPrimary) {
        // At most one primary code per product.
        await tx.productBarcode.updateMany({
          where: { productId },
          data: { isPrimary: false },
        });
      }

      await tx.productBarcode.upsert({
        where: { code },
        create: { code, productId, isPrimary },
        update: { isPrimary },
      });
    });

    return this.findById(productId);
  }

  private buildWhere(
    criteria: ProductSearchCriteria,
  ): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = {};

    if (!criteria.includeInactive) {
      where.isActive = true;
    }

    if (criteria.categoryIds?.length) {
      where.categoryId = { in: criteria.categoryIds };
    } else if (criteria.categoryId) {
      where.categoryId = criteria.categoryId;
    }

    if (criteria.brandId) {
      where.brandId = criteria.brandId;
    }

    if (criteria.term) {
      // The term arrives already normalized, so both sides of the comparison
      // have been through the same transformation — which is what lets
      // "serenisima" match "La Serenísima". Matching the raw display name
      // case-insensitively would not: ILIKE does not fold accents.
      where.OR = [
        { normalizedName: { contains: criteria.term } },
        { brand: { normalizedName: { contains: criteria.term } } },
      ];
    }

    return where;
  }

  private toDomain(row: ProductRow): Product {
    return {
      id: row.id,
      name: row.name,
      normalizedName: row.normalizedName,
      description: row.description,
      brand: row.brand
        ? { id: row.brand.id, name: row.brand.name, slug: row.brand.slug }
        : null,
      category: {
        id: row.category.id,
        name: row.category.name,
        slug: row.category.slug,
        parentId: row.category.parentId,
      },
      // Decimal is a Prisma detail; the domain works in plain numbers.
      packageSize: row.packageSize === null ? null : Number(row.packageSize),
      unit: row.unit as UnitOfMeasure,
      imageUrl: row.imageUrl,
      isActive: row.isActive,
      barcodes: row.barcodes.map((barcode) => ({
        code: barcode.code,
        isPrimary: barcode.isPrimary,
      })),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
