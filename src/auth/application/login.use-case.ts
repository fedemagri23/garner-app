import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../security/domain/password-hasher.port.js';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../users/domain/user.repository.port.js';
import { IssueTokenPairService } from './issue-token-pair.service.js';
import type { TokenPair } from './token-pair.js';

export interface LoginCommand {
  email: string;
  password: string;
}

@Injectable()
export class LoginUseCase {
  /**
   * Verifying against a throwaway hash when no account matches keeps the
   * failure path the same cost as the success path, so response timing does
   * not reveal which emails are registered.
   */
  private decoyHash?: Promise<string>;

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    private readonly issueTokens: IssueTokenPairService,
  ) {}

  async execute(command: LoginCommand): Promise<TokenPair> {
    const user = await this.users.findByEmailWithCredentials(command.email);

    if (!user) {
      await this.hasher.verify(await this.getDecoyHash(), command.password);
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await this.hasher.verify(
      user.passwordHash,
      command.password,
    );

    // One message for a wrong password, an unknown email and a disabled
    // account: the client learns only that the attempt failed.
    if (!passwordMatches || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokens.issue({
      id: user.id,
      email: user.email,
      role: user.role,
    });
  }

  private getDecoyHash(): Promise<string> {
    this.decoyHash ??= this.hasher.hash('decoy-password-for-timing-parity');
    return this.decoyHash;
  }
}
