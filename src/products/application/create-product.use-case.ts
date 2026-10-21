import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { normalizeText, slugify } from '../../common/text/normalize.js';
import { isValidBarcode, normalizeBarcode } from '../domain/barcode.js';
import {
  normalizeProductName,
  type Brand,
  type Product,
} from '../domain/product.entity.js';
import { CommunityPolicy } from '../../community/application/community-policy.js';
import { CatalogOrigin } from '../../community/domain/catalog-origin.js';
import {
  COMMUNITY_REPOSITORY,
  type CommunityRepository,
} from '../../community/domain/community.port.js';
import { looksLikeSameProduct } from '../../community/domain/duplicates.js';
import { VERIFIED_BONUS } from '../../community/domain/ranking-weight.js';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
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
  /** Chosen by the phone when it adds one offline, so sending it twice adds it once. */
  id?: string;
  name: string;
  description?: string;
  categoryId: string;
  brandId?: string;
  /** A brand that is not listed yet; found by name or added. */
  brandName?: string;
  packageSize?: number;
  unit: UnitOfMeasure;
  imageUrl?: string;
  barcodes?: string[];
}

/**
 * Adds a product to the catalog. The team's are VERIFIED. Anyone else's are
 * COMMUNITY: visible to everyone at once, but ranked by how many people back
 * them, limited to a few a day, and refused when the same product (name, brand
 * and size) is already there. A shopper's image link is not taken: pictures
 * from strangers' URLs are a way to show anyone anything.
 *
 * The checks for everyone are about identity: a real category and, for
 * barcodes, well-formed and unclaimed ones.
 *
 * A phone that added one offline sends its own id; sending it again (the
 * answer was lost on the way back) returns the product it already added.
 */
@Injectable()
export class CreateProductUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(CATEGORY_REPOSITORY)
    private readonly categories: CategoryRepository,
    @Inject(BRAND_REPOSITORY) private readonly brands: BrandRepository,
    @Inject(COMMUNITY_REPOSITORY) private readonly community: CommunityRepository,
    private readonly policy: CommunityPolicy,
  ) {}

  async execute(command: CreateProductCommand, actor: AuthenticatedUser): Promise<Product> {
    const fromTeam = actor.role === 'MODERATOR' || actor.role === 'ADMIN';

    if (command.id) {
      const earlier = await this.products.findById(command.id);
      if (earlier) {
        if (earlier.createdById !== (fromTeam ? null : actor.id)) {
          throw new ConflictException('This id belongs to another product');
        }
        return earlier;
      }
    }

    if (!fromTeam) {
      await this.policy.assertMayCreate(actor.id, 'PRODUCT');
    }

    const category = await this.categories.findById(command.categoryId);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (command.brandId && !(await this.brands.findById(command.brandId))) {
      throw new NotFoundException('Brand not found');
    }
    // A brand named but not listed has no products yet, so nothing can be a twin.
    const namedBrand = command.brandId ? null : await this.listedBrand(command.brandName);
    const brandId = command.brandId ?? namedBrand?.id ?? null;
    const brandIsNew = Boolean(command.brandName?.trim()) && !command.brandId && !namedBrand;

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

    const normalizedName = normalizeProductName(command.name);
    const identity = {
      normalizedName,
      brandId,
      packageSize: command.packageSize ?? null,
      unit: command.unit,
    };
    const twin = brandIsNew
      ? undefined
      : (await this.community.productsNamed(normalizedName, 20)).find((existing) =>
          looksLikeSameProduct(identity, existing),
        );
    if (twin && !fromTeam) {
      throw new ConflictException(`This product is already in the catalog: ${twin.name}`);
    }

    const product = await this.products.create({
      id: command.id,
      name: command.name.trim(),
      normalizedName,
      description: command.description?.trim() ?? null,
      brandId: brandIsNew ? (await this.newBrand(command.brandName!)).id : brandId,
      categoryId: command.categoryId,
      packageSize: command.packageSize ?? null,
      unit: command.unit,
      imageUrl: fromTeam ? (command.imageUrl ?? null) : null,
      origin: fromTeam ? CatalogOrigin.Verified : CatalogOrigin.Community,
      createdById: fromTeam ? null : actor.id,
      weight: fromTeam ? VERIFIED_BONUS : 0,
    });

    if (!fromTeam) {
      await this.community.audit({ actorId: actor.id, action: 'created', targetType: 'PRODUCT', targetId: product.id });
    }

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

  private async listedBrand(name: string | undefined): Promise<Brand | null> {
    const trimmed = name?.trim();
    return trimmed ? this.brands.findBySlug(slugify(trimmed)) : null;
  }

  private newBrand(name: string): Promise<Brand> {
    const trimmed = name.trim();
    return this.brands.create({ name: trimmed, normalizedName: normalizeText(trimmed), slug: slugify(trimmed) });
  }
}
