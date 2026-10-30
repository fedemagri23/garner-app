import type { Language } from '../../common/i18n/language.js';
import type { UserRole } from '../../security/domain/user-role.js';

/** An account as the rest of the system sees it — never carries the password hash. */
export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  /** What push and email are written in. */
  locale: Language;
  /** The terms version this account accepted; null if none yet. */
  termsVersion: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Only the authentication path may see stored credentials, so the hash is a
 * separate type that the repository hands out from exactly one method.
 */
export interface UserWithCredentials extends User {
  passwordHash: string;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
}

/**
 * What an account holder may change about themselves. The email is absent on
 * purpose: it identifies the account and doubles as the login, so changing it
 * is a verification flow rather than a profile edit.
 */
export interface UpdateUserProfileInput {
  displayName?: string;
  locale?: Language;
}

/** Emails are matched case-insensitively; storing them normalized keeps the unique index honest. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
