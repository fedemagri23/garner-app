/**
 * Where a price came from. Mirrors the Prisma enum; business code depends on
 * this copy so the domain never imports a generated client.
 */
export const PriceSourceType = {
  UserReported: 'USER_REPORTED',
  UserWithEvidence: 'USER_WITH_EVIDENCE',
  PurchaseConfirmed: 'PURCHASE_CONFIRMED',
  ExternalApi: 'EXTERNAL_API',
} as const;

export type PriceSourceType =
  (typeof PriceSourceType)[keyof typeof PriceSourceType];

export const PriceObservationStatus = {
  Accepted: 'ACCEPTED',
  Flagged: 'FLAGGED',
  Rejected: 'REJECTED',
} as const;

export type PriceObservationStatus =
  (typeof PriceObservationStatus)[keyof typeof PriceObservationStatus];

/**
 * Why an observation was flagged or rejected. Internal vocabulary: these are
 * stored for review and abuse analysis but never shown to the contributor.
 */
export const ReviewReason = {
  NewAccount: 'NEW_ACCOUNT',
  PriceDeviation: 'PRICE_DEVIATION',
  ExtremePriceDeviation: 'EXTREME_PRICE_DEVIATION',
  RepeatedSubmission: 'REPEATED_SUBMISSION',
  HighAccountVolume: 'HIGH_ACCOUNT_VOLUME',
  ProductVolumeSpike: 'PRODUCT_VOLUME_SPIKE',
  StoreVolumeSpike: 'STORE_VOLUME_SPIKE',
  RepeatedDeviations: 'REPEATED_DEVIATIONS',
} as const;

export type ReviewReason = (typeof ReviewReason)[keyof typeof ReviewReason];

export interface PriceObservation {
  id: string;
  productId: string;
  storeId: string;
  priceCents: number;
  currency: string;
  observedAt: Date;
  receivedAt: Date;
  sourceType: PriceSourceType;
  status: PriceObservationStatus;
  reviewReasons: ReviewReason[];
  userId: string | null;
  shoppingSessionId: string | null;
  dedupeKey: string | null;
  evidencePhotoKey: string | null;
  evidenceNote: string | null;
}

export type NewPriceObservation = Omit<PriceObservation, 'id' | 'receivedAt'> & {
  id?: string;
};

/** A source typed in by a person, as opposed to a purchase or a feed. */
export function isUserSubmitted(sourceType: PriceSourceType): boolean {
  return (
    sourceType === PriceSourceType.UserReported ||
    sourceType === PriceSourceType.UserWithEvidence
  );
}
