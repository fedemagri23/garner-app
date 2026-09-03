import {
  generateRefreshToken,
  hashRefreshToken,
  isRefreshTokenUsable,
  type RefreshTokenRecord,
} from './refresh-token.entity.js';

const record = (overrides: Partial<RefreshTokenRecord> = {}): RefreshTokenRecord => ({
  id: 'token-1',
  userId: 'user-1',
  expiresAt: new Date(Date.now() + 60_000),
  revokedAt: null,
  ...overrides,
});

describe('refresh token', () => {
  it('generates a distinct token each call', () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => generateRefreshToken()),
    );
    expect(tokens.size).toBe(50);
  });

  it('hashes deterministically so a presented token can be looked up', () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token)).toEqual(hashRefreshToken(token));
  });

  it('never stores the token itself', () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token)).not.toContain(token);
  });

  describe('isRefreshTokenUsable', () => {
    it('accepts an unexpired, unrevoked token', () => {
      expect(isRefreshTokenUsable(record())).toBe(true);
    });

    it('rejects a revoked token', () => {
      expect(isRefreshTokenUsable(record({ revokedAt: new Date() }))).toBe(
        false,
      );
    });

    it('rejects an expired token', () => {
      expect(
        isRefreshTokenUsable(record({ expiresAt: new Date(Date.now() - 1) })),
      ).toBe(false);
    });

    it('rejects a token expiring exactly now', () => {
      const now = new Date();
      expect(isRefreshTokenUsable(record({ expiresAt: now }), now)).toBe(false);
    });
  });
});
