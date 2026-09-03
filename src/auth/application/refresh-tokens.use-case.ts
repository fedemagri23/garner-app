import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../users/domain/user.repository.port.js';
import {
  hashRefreshToken,
  isRefreshTokenUsable,
} from '../domain/refresh-token.entity.js';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from '../domain/refresh-token.repository.port.js';
import { IssueTokenPairService } from './issue-token-pair.service.js';
import type { TokenPair } from './token-pair.js';

@Injectable()
export class RefreshTokensUseCase {
  private readonly logger = new Logger(RefreshTokensUseCase.name);

  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly issueTokens: IssueTokenPairService,
  ) {}

  async execute(presentedToken: string): Promise<TokenPair> {
    const record = await this.refreshTokens.findByHash(
      hashRefreshToken(presentedToken),
    );

    if (!record) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // A token that was already rotated away is either a replay or a stolen
    // copy. Either way the session family is no longer trustworthy, so every
    // session for that user is dropped rather than just this one.
    if (record.revokedAt !== null) {
      this.logger.warn(
        `Refresh token reuse detected for user ${record.userId}; revoking all sessions`,
      );
      await this.refreshTokens.revokeAllForUser(record.userId);
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!isRefreshTokenUsable(record)) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.users.findById(record.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Rotation: the presented token dies as the new pair is issued.
    await this.refreshTokens.revokeById(record.id);

    return this.issueTokens.issue({
      id: user.id,
      email: user.email,
      role: user.role,
    });
  }
}
