import { UnauthorizedException } from '@nestjs/common';
import type { User } from '../../users/domain/user.entity.js';
import type { UserRepository } from '../../users/domain/user.repository.port.js';
import {
  hashRefreshToken,
  type RefreshTokenRecord,
} from '../domain/refresh-token.entity.js';
import type { RefreshTokenRepository } from '../domain/refresh-token.repository.port.js';
import type { IssueTokenPairService } from './issue-token-pair.service.js';
import { RefreshTokensUseCase } from './refresh-tokens.use-case.js';

describe('RefreshTokensUseCase', () => {
  const presentedToken = 'presented-refresh-token';

  const activeUser: User = {
    id: 'user-1',
    email: 'shopper@example.com',
    displayName: 'Shopper',
    role: 'USER',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const storedRecord = (
    overrides: Partial<RefreshTokenRecord> = {},
  ): RefreshTokenRecord => ({
    id: 'token-1',
    userId: 'user-1',
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    ...overrides,
  });

  let refreshTokens: jest.Mocked<RefreshTokenRepository>;
  let users: jest.Mocked<UserRepository>;
  let issueTokens: jest.Mocked<Pick<IssueTokenPairService, 'issue'>>;
  let useCase: RefreshTokensUseCase;

  beforeEach(() => {
    refreshTokens = {
      create: jest.fn(),
      findByHash: jest.fn(),
      revokeById: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    users = {
      findById: jest.fn().mockResolvedValue(activeUser),
      findByEmailWithCredentials: jest.fn(),
      create: jest.fn(),
    };
    issueTokens = {
      issue: jest.fn().mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      }),
    };

    useCase = new RefreshTokensUseCase(
      refreshTokens,
      users,
      issueTokens as unknown as IssueTokenPairService,
    );
  });

  it('looks the token up by its hash, never by the raw value', async () => {
    refreshTokens.findByHash.mockResolvedValue(storedRecord());

    await useCase.execute(presentedToken);

    expect(refreshTokens.findByHash).toHaveBeenCalledWith(
      hashRefreshToken(presentedToken),
    );
  });

  it('rotates: revokes the presented token and issues a new pair', async () => {
    refreshTokens.findByHash.mockResolvedValue(storedRecord());

    await expect(useCase.execute(presentedToken)).resolves.toEqual({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
    expect(refreshTokens.revokeById).toHaveBeenCalledWith('token-1');
  });

  it('revokes every session when an already-rotated token is replayed', async () => {
    refreshTokens.findByHash.mockResolvedValue(
      storedRecord({ revokedAt: new Date() }),
    );

    // Replay means the token leaked or the client is buggy; either way the
    // whole family is untrustworthy, so all sessions are dropped.
    await expect(useCase.execute(presentedToken)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
    expect(issueTokens.issue).not.toHaveBeenCalled();
  });

  it('rejects an expired token without nuking other sessions', async () => {
    refreshTokens.findByHash.mockResolvedValue(
      storedRecord({ expiresAt: new Date(Date.now() - 1) }),
    );

    await expect(useCase.execute(presentedToken)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('rejects an unknown token', async () => {
    refreshTokens.findByHash.mockResolvedValue(null);

    await expect(useCase.execute(presentedToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects when the account has been deactivated since the token was issued', async () => {
    refreshTokens.findByHash.mockResolvedValue(storedRecord());
    users.findById.mockResolvedValue({ ...activeUser, isActive: false });

    await expect(useCase.execute(presentedToken)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(issueTokens.issue).not.toHaveBeenCalled();
  });
});
