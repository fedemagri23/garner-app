import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../../security/domain/password-hasher.port.js';
import { USER_REPOSITORY, type UserRepository } from '../../users/domain/user.repository.port.js';
import { REFRESH_TOKEN_REPOSITORY, type RefreshTokenRepository } from '../domain/refresh-token.repository.port.js';
import { IssueTokenPairService } from './issue-token-pair.service.js';
import type { TokenPair } from './token-pair.js';

/** What a signed-in person does to keep their account theirs. */
@Injectable()
export class AccountSecurityUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly sessions: RefreshTokenRepository,
    private readonly tokens: IssueTokenPairService,
  ) {}

  /**
   * A new password, given the current one. Every other device is signed out;
   * this one gets a fresh pair so it stays signed in.
   */
  async changePassword(actor: AuthenticatedUser, current: string, next: string): Promise<TokenPair> {
    const profile = await this.users.findById(actor.id);
    const user = profile ? await this.users.findByEmailWithCredentials(profile.email) : null;
    if (!user || !(await this.hasher.verify(user.passwordHash, current))) {
      throw new ForbiddenException('The current password is wrong');
    }
    await this.users.updatePasswordHash(user.id, await this.hasher.hash(next));
    await this.sessions.endAllForUser(user.id);
    return this.tokens.issue(actor);
  }

  /** "Cerrar sesión en todos los dispositivos". */
  async signOutEverywhere(actor: AuthenticatedUser): Promise<void> {
    await this.sessions.endAllForUser(actor.id);
  }
}
