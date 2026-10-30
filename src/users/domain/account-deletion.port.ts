/**
 * Erasing an account. Its personal data goes — lists, trips, alerts,
 * messages, phones, preferences, sessions — and the account itself is
 * anonymised rather than deleted: prices, products and shops it gave stay
 * for everyone, attached to nobody.
 */
export interface AccountDeletion {
  erase(userId: string, at: Date): Promise<void>;
}

export const ACCOUNT_DELETION = Symbol('ACCOUNT_DELETION');
