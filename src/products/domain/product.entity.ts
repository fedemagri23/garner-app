import { normalizeText } from '../../common/text/normalize.js';
import type { CatalogOrigin, ModerationStatus } from '../../community/domain/catalog-origin.js';
import type { UnitOfMeasure } from './unit-of-measure.js';

/** A brand as the catalog exposes it. */
export interface Brand {
  id: string;
  name: string;
  slug: string;
}

/** A category, with its parent when it is nested. */
export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

export interface ProductBarcode {
  code: string;
  isPrimary: boolean;
}

/**
 * A canonical product.
 *
 * It deliberately carries no price and no store: a price belongs to a product
 * *at* a store *at* a time and lives in `pricing_db`. Keeping them apart is
 * what makes the identity stable — a product can be renamed, re-categorized
 * or re-branded without disturbing the history recorded against its id.
 */
export interface Product {
  id: string;
  name: string;
  normalizedName: string;
  description: string | null;
  brand: Brand | null;
  category: Category;
  packageSize: number | null;
  unit: UnitOfMeasure;
  imageUrl: string | null;
  isActive: boolean;
  barcodes: ProductBarcode[];
  /** The team's, or added by a shopper (`createdById`). */
  origin: CatalogOrigin;
  createdById: string | null;
  moderationStatus: ModerationStatus;
  /** People other than its creator who said it exists and is right. */
  confirmationCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProductInput {
  /** Given when the client chose it (an offline add); generated otherwise. */
  id?: string;
  name: string;
  normalizedName: string;
  description: string | null;
  brandId: string | null;
  categoryId: string;
  packageSize: number | null;
  unit: UnitOfMeasure;
  imageUrl: string | null;
  /** Absent for the team's products; a shopper's are COMMUNITY with their id. */
  origin?: CatalogOrigin;
  createdById?: string | null;
  /** Its starting rank among search matches (`rankingWeight`). */
  weight?: number;
}

/**
 * The fields a product may change after creation. `id` is absent on purpose:
 * correcting a product edits it, it never replaces it with a new identity.
 */
export interface UpdateProductInput {
  name?: string;
  normalizedName?: string;
  description?: string | null;
  brandId?: string | null;
  categoryId?: string;
  packageSize?: number | null;
  unit?: UnitOfMeasure;
  imageUrl?: string | null;
  /** Products are retired by clearing this, never deleted. */
  isActive?: boolean;
}

/** The matching key stored alongside the display name. */
export function normalizeProductName(name: string): string {
  return normalizeText(name);
}
