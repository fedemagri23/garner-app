import type { CatalogOrigin, ModerationStatus } from './catalog-origin.js';

/**
 * One word for where something a shopper added stands, as they see it:
 * only they see it (a shop not yet published), everyone does, the team
 * vouched for it, flags pulled it for a look, or it was taken down.
 */
export type AdditionStatus = 'PRIVATE' | 'PUBLIC' | 'VERIFIED' | 'UNDER_REVIEW' | 'HIDDEN';

export const ADDITION_STATUSES: readonly AdditionStatus[] = ['PRIVATE', 'PUBLIC', 'VERIFIED', 'UNDER_REVIEW', 'HIDDEN'];

export function additionStatus(entry: {
  origin: CatalogOrigin;
  moderationStatus: ModerationStatus;
  /** Products are public from the start; shops once published. */
  isPublic: boolean;
}): AdditionStatus {
  if (entry.moderationStatus === 'HIDDEN' || entry.moderationStatus === 'MERGED') return 'HIDDEN';
  if (entry.moderationStatus === 'UNDER_REVIEW') return 'UNDER_REVIEW';
  if (entry.origin === 'VERIFIED') return 'VERIFIED';
  return entry.isPublic ? 'PUBLIC' : 'PRIVATE';
}
