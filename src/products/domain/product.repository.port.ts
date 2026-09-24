import type {
  Brand,
  Category,
  CreateProductInput,
  Product,
  UpdateProductInput,
} from './product.entity.js';

/** Filters for catalog search; every field narrows the result further. */
export interface ProductSearchCriteria {
  /** Free text, already normalized, matched against name and brand. */
  term?: string;
  categoryId?: string;
  /** Includes the category's descendants, so browsing "Dairy" finds "Milk". */
  categoryIds?: string[];
  brandId?: string;
  includeInactive?: boolean;
  skip: number;
  take: number;
}

export interface ProductSearchResult {
  products: Product[];
  totalItems: number;
}

/**
 * The products module's public data contract. Shopping lists, pricing and
 * optimization read the catalog through this port; nothing outside
 * `products/infrastructure` touches the catalog tables.
 */
export interface ProductRepository {
  search(criteria: ProductSearchCriteria): Promise<ProductSearchResult>;
  findById(id: string): Promise<Product | null>;
  findManyByIds(ids: string[]): Promise<Product[]>;
  findByBarcode(code: string): Promise<Product | null>;
  /**
   * Exact matches on the stored matching key. Used by external imports to tie
   * a supermarket's product to ours when there is no barcode to go on.
   */
  findByNormalizedName(normalizedName: string): Promise<Product[]>;
  create(input: CreateProductInput): Promise<Product>;
  update(id: string, input: UpdateProductInput): Promise<Product>;
  /** Returns null when the code already belongs to another product. */
  addBarcode(
    productId: string,
    code: string,
    isPrimary: boolean,
  ): Promise<Product | null>;
}

export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');

export interface CategoryRepository {
  findAll(): Promise<Category[]>;
  findById(id: string): Promise<Category | null>;
  findBySlug(slug: string): Promise<Category | null>;
  findBySlugs(slugs: string[]): Promise<Category[]>;
  /** The category itself plus every descendant, for category browsing. */
  findSubtreeIds(id: string): Promise<string[]>;
  create(input: {
    name: string;
    slug: string;
    parentId: string | null;
  }): Promise<Category>;
}

export const CATEGORY_REPOSITORY = Symbol('CATEGORY_REPOSITORY');

export interface BrandRepository {
  findAll(): Promise<Brand[]>;
  findById(id: string): Promise<Brand | null>;
  findBySlug(slug: string): Promise<Brand | null>;
  create(input: {
    name: string;
    normalizedName: string;
    slug: string;
  }): Promise<Brand>;
}

export const BRAND_REPOSITORY = Symbol('BRAND_REPOSITORY');
