import { CatalogOrigin } from './catalog-origin.js';

export interface WeightInputs {
  origin: CatalogOrigin;
  /** Distinct users, other than the creator, who confirmed it exists and is right. */
  confirmingUsers: number;
  /** Distinct users, other than the creator, with an accepted price in the last 90 days. */
  recentPricingUsers: number;
  /** Distinct users who flagged it. */
  flaggingUsers: number;
  /** Days since anyone confirmed it or priced it. */
  daysSinceActivity: number;
}

/** Above the most a community entry can reach (20 confirmations and 20 price updates is 100): the team's entries always rank first. */
export const VERIFIED_BONUS = 150;
const CONFIRMATION_POINTS = 3;
const PRICING_POINTS = 2;
const FLAG_PENALTY = 5;
/** Past this many people the signal is as strong as it gets: one popular entry must not bury the rest for good. */
const SIGNAL_CAP = 20;
const MAX_DECAY = 10;

/**
 * How high an entry ranks among equal text matches. Confirmations and price
 * updates raise it, flags lower it, and a community entry nobody has touched
 * for months slides a little. Counted in distinct people, so one user
 * repeating themselves adds nothing.
 */
export function rankingWeight(inputs: WeightInputs): number {
  const verified = inputs.origin === CatalogOrigin.Verified ? VERIFIED_BONUS : 0;
  const decay =
    inputs.origin === CatalogOrigin.Verified
      ? 0
      : Math.min(MAX_DECAY, Math.floor(Math.max(0, inputs.daysSinceActivity) / 30));

  const raw =
    verified +
    Math.min(inputs.confirmingUsers, SIGNAL_CAP) * CONFIRMATION_POINTS +
    Math.min(inputs.recentPricingUsers, SIGNAL_CAP) * PRICING_POINTS -
    inputs.flaggingUsers * FLAG_PENALTY -
    decay;

  return Math.max(0, raw);
}
