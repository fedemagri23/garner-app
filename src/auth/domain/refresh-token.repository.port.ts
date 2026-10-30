import type { RefreshTokenRecord } from './refresh-token.entity.js';

export interface CreateRefreshTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface RefreshTokenRepository {
  create(input: CreateRefreshTokenInput): Promise<RefreshTokenRecord>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  revokeById(id: string): Promise<void>;
  /** Breach response: drops every session a user holds. */
  revokeAllForUser(userId: string): Promise<void>;
  /**
   * A deliberate sign-out of every device (password changed or reset, "sign
   * out everywhere"): the tokens are deleted, not revoked, so a phone still
   * holding one gets a plain 401 instead of tripping the reuse alarm — which
   * would sign out the device that made the change too.
   */
  endAllForUser(userId: string): Promise<void>;
}

export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');
