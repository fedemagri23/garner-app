/** Flags, counted by how much each flagger can be trusted, that take an entry out of search. */
export const HIDE_THRESHOLD = 3;

export interface Flagger {
  /** 0 for a brand-new or abusive account, up to 1 for a long, clean history. */
  trust: number;
}

/**
 * Whether enough people have flagged an entry to pull it from search until a
 * moderator looks. Each flag counts for the flagger's trust, so a handful of
 * throwaway accounts cannot bury a good entry, and distinct people are
 * counted once however many times they flag.
 */
export function shouldHide(flaggers: Flagger[]): boolean {
  return flaggers.reduce((sum, flagger) => sum + Math.min(1, Math.max(0, flagger.trust)), 0) >= HIDE_THRESHOLD;
}

/** A person's standing, from what became of what they added. Starts neutral. */
export function trustScore(history: { accepted: number; hiddenOrRejected: number; accountAgeDays: number }): number {
  const base = Math.min(0.4, history.accountAgeDays / 60) + Math.min(0.4, history.accepted * 0.05);
  return Math.min(1, Math.max(0, base - history.hiddenOrRejected * 0.25));
}

export type CreationKind = 'product' | 'store';

/**
 * How many entries a person may add per day. Accounts in their first day get
 * a small allowance; one with entries moderators removed gets the same.
 */
export function dailyCreationLimit(kind: CreationKind, account: { ageHours: number; trust: number }): number {
  const careful = account.ageHours < 24 || account.trust < 0.2;
  if (kind === 'product') return careful ? 3 : 30;
  return careful ? 1 : 5;
}
