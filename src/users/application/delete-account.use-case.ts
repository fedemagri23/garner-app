import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { PASSWORD_HASHER, type PasswordHasher } from '../../security/domain/password-hasher.port.js';
import { ACCOUNT_DELETION, type AccountDeletion } from '../domain/account-deletion.port.js';
import { USER_REPOSITORY, type UserRepository } from '../domain/user.repository.port.js';

/**
 * "Eliminar mi cuenta", from the app or the web page: the password again,
 * then the account's personal data is erased and the account anonymised
 * (`AccountDeletion`). Cannot be undone.
 */
@Injectable()
export class DeleteAccountUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(ACCOUNT_DELETION) private readonly deletion: AccountDeletion,
  ) {}

  /** For the signed-in account. */
  async byId(userId: string, password: string, now: Date = new Date()): Promise<void> {
    const user = await this.users.findById(userId);
    await this.byEmail(user?.email ?? '', password, now);
  }

  /** For the web page, where nobody is signed in: email and password. */
  async byEmail(email: string, password: string, now: Date = new Date()): Promise<void> {
    const user = email ? await this.users.findByEmailWithCredentials(email) : null;
    if (!user || !user.isActive || !(await this.hasher.verify(user.passwordHash, password))) {
      throw new ForbiddenException('Wrong email or password');
    }
    await this.deletion.erase(user.id, now);
  }
}
