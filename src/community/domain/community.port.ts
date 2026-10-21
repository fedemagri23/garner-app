import type { Coordinates } from '../../supermarkets/domain/geo.js';
import type { CatalogOrigin, ModerationStatus } from './catalog-origin.js';

export type FlagTarget = 'PRODUCT' | 'STORE';
export type FlagReason = 'DUPLICATE' | 'WRONG_INFO' | 'NOT_EXIST' | 'INAPPROPRIATE';

/** What a person's record says about how far to trust what they add. */
export interface Standing {
  accountCreatedAt: Date;
  /** Accepted prices they have given (each product at each shop once). */
  acceptedContributions: number;
  /** Their entries moderators hid or flags pulled. */
  removedEntries: number;
}

/** What goes into a product's rank, counted in distinct people. */
export interface ProductSignals {
  origin: CatalogOrigin;
  createdById: string | null;
  confirmingUsers: number;
  recentPricingUsers: number;
  flaggingUsers: number;
  lastActivityAt: Date | null;
}

export interface SimilarProduct {
  id: string;
  name: string;
  normalizedName: string;
  brandId: string | null;
  packageSize: number | null;
  unit: string;
  /** Filled for "is it one of these?", where people need to tell them apart. */
  brandName?: string | null;
}

export interface NearbyStore extends Coordinates {
  id: string;
  name: string;
  supermarketId: string;
  /** Null for the team's shops. */
  createdById: string | null;
  publishedAt: Date | null;
}

/** A shop as far as publishing it is concerned. */
export interface StoreStanding {
  origin: CatalogOrigin;
  createdById: string | null;
  publishedAt: Date | null;
  moderationStatus: ModerationStatus;
}

export interface ReviewItem {
  targetType: FlagTarget;
  id: string;
  name: string;
  moderationStatus: ModerationStatus;
  flagCount: number;
  confirmationCount: number;
  createdAt: Date;
}

/** A product someone added, as they see it in their list. */
export interface AddedProduct {
  id: string;
  name: string;
  brandName: string | null;
  origin: CatalogOrigin;
  moderationStatus: ModerationStatus;
  confirmationCount: number;
  createdAt: Date;
}

/** A shop someone added, as they see it in their list. */
export interface AddedStore {
  id: string;
  name: string;
  supermarketName: string;
  addressLine: string;
  origin: CatalogOrigin;
  moderationStatus: ModerationStatus;
  publishedAt: Date | null;
  pricedProductCount: number;
  createdAt: Date;
}

/** What one person has already said about an entry. */
export interface ViewerSay {
  confirmed: boolean;
  flagged: boolean;
}

export interface AuditEntry {
  actorId: string | null;
  action: string;
  targetType: FlagTarget;
  targetId: string;
  note?: string;
}

/**
 * The community's data: confirmations, flags, who priced what where, the
 * counters and moderation state they drive, and the audit trail. One port
 * because each use case touches several of these together.
 */
export interface CommunityRepository {
  standing(userId: string): Promise<Standing>;
  countCreatedSince(target: FlagTarget, userId: string, since: Date): Promise<number>;
  countFlagsSince(userId: string, since: Date): Promise<number>;

  /** Active products with exactly this normalized name, for the duplicate check. */
  productsNamed(normalizedName: string, limit: number): Promise<SimilarProduct[]>;
  /** Active products whose normalized name contains this text, for "is it one of these?". */
  productsLike(normalizedText: string, limit: number): Promise<SimilarProduct[]>;
  /** Active shops within the box, public or not, for the duplicate check. */
  storesWithin(box: { minLatitude: number; maxLatitude: number; minLongitude: number; maxLongitude: number }): Promise<NearbyStore[]>;

  /** False when this person had already confirmed it. */
  confirm(productId: string, userId: string): Promise<boolean>;
  /** False when there was nothing to take back. */
  unconfirm(productId: string, userId: string): Promise<boolean>;
  /** False when this person had already flagged it. */
  flag(target: FlagTarget, targetId: string, userId: string, reason: FlagReason): Promise<boolean>;
  flaggers(target: FlagTarget, targetId: string): Promise<string[]>;
  /** Whether this person confirmed (products only) or flagged the entry. */
  viewerSay(target: FlagTarget, targetId: string, userId: string): Promise<ViewerSay>;
  /** Everything this person added, newest first, hidden entries included. */
  addedBy(userId: string, limit: number): Promise<{ products: AddedProduct[]; stores: AddedStore[] }>;

  /** False when this person's price for this product at this shop was already counted. */
  recordContribution(storeId: string, productId: string, userId: string): Promise<boolean>;
  /** Distinct products and people with an accepted price at the shop. */
  storeCounts(storeId: string): Promise<{ pricedProducts: number; contributors: number }>;
  productSignals(productId: string, pricedSince: Date): Promise<ProductSignals | null>;
  storeStanding(storeId: string): Promise<StoreStanding | null>;

  saveProductStanding(
    productId: string,
    standing: { weight: number; confirmationCount: number; flagCount: number; lastActivityAt: Date | null },
  ): Promise<void>;
  saveStoreProgress(
    storeId: string,
    progress: { pricedProductCount: number; contributorCount: number; publishedAt?: Date },
  ): Promise<void>;
  setStoreFlagCount(storeId: string, flagCount: number): Promise<void>;
  setModeration(target: FlagTarget, id: string, status: ModerationStatus, extra?: { verified?: boolean }): Promise<boolean>;

  reviewQueue(limit: number): Promise<ReviewItem[]>;
  audit(entry: AuditEntry): Promise<void>;
}

export const COMMUNITY_REPOSITORY = Symbol('COMMUNITY_REPOSITORY');
