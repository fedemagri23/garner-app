import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '../../common/config/app-config.service.js';
import { AccessTokenService } from '../../security/application/access-token.service.js';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import {
  generateRefreshToken,
  hashRefreshToken,
} from '../domain/refresh-token.entity.js';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from '../domain/refresh-token.repository.port.js';
import type { TokenPair } from './token-pair.js';

/**
 * The single place a session is minted. Register, login and refresh all route
 * through here so the persisted-refresh-token invariant cannot be forgotten in
 * one of them.
 */
@Injectable()
export class IssueTokenPairService {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly config: AppConfigService,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  async issue(user: AuthenticatedUser): Promise<TokenPair> {
    const accessToken = await this.accessTokens.issue(user);
    const refreshToken = generateRefreshToken();

    const expiresAt = new Date(
      Date.now() + this.config.jwtRefreshTtlDays * 24 * 60 * 60 * 1000,
    );

    await this.refreshTokens.create({
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt,
    });

    return { accessToken, refreshToken };
  }
}
