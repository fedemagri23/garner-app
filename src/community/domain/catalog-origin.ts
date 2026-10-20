/**
 * Who a catalog entry comes from. The team's entries are the reference;
 * shoppers' are welcome and visible, but ranked by how much other people
 * stand behind them.
 */
export const CatalogOrigin = {
  Verified: 'VERIFIED',
  Community: 'COMMUNITY',
} as const;
export type CatalogOrigin = (typeof CatalogOrigin)[keyof typeof CatalogOrigin];

/** Where an entry stands in moderation. Only ACTIVE entries show in search. */
export const ModerationStatus = {
  Active: 'ACTIVE',
  UnderReview: 'UNDER_REVIEW',
  Hidden: 'HIDDEN',
  Merged: 'MERGED',
} as const;
export type ModerationStatus = (typeof ModerationStatus)[keyof typeof ModerationStatus];
