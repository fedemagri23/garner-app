import { Inject, Injectable } from '@nestjs/common';
import { hashRefreshToken } from '../domain/refresh-token.entity.js';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from '../domain/refresh-token.repository.port.js';

@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  /**
   * Idempotent by design: logging out with an unknown or already-revoked token
   * succeeds silently, because the caller's goal — that token no longer works
   * — already holds, and reporting otherwise would leak which tokens exist.
   */
  async execute(presentedToken: string): Promise<void> {
    const record = await this.refreshTokens.findByHash(
      hashRefreshToken(presentedToken),
    );

    if (!record || record.revokedAt !== null) {
      return;
    }

    await this.refreshTokens.revokeById(record.id);
  }
}
