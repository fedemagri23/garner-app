import { createHash, randomBytes } from 'node:crypto';

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

/**
 * Refresh tokens are opaque high-entropy strings rather than JWTs, so that a
 * single row update can revoke one — a stateless JWT cannot be withdrawn.
 */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * SHA-256 rather than a password hash: the token is 256 bits of randomness, so
 * there is nothing to brute-force, and lookup needs a deterministic value to
 * match against a unique index. Storing the hash means a database leak alone
 * does not yield usable tokens.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isRefreshTokenUsable(
  record: RefreshTokenRecord,
  now: Date = new Date(),
): boolean {
  return record.revokedAt === null && record.expiresAt > now;
}
