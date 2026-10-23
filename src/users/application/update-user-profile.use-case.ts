import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Language } from '../../common/i18n/language.js';
import type { User } from '../domain/user.entity.js';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../domain/user.repository.port.js';

export interface UpdateUserProfileCommand {
  displayName?: string;
  /** The app's language, sent when the shopper picks one (or the phone's is used). */
  locale?: Language;
}

/**
 * A user edits their own profile and no one else's: the controller passes the
 * authenticated id, so there is no resource id to authorize against.
 */
@Injectable()
export class UpdateUserProfileUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async execute(
    userId: string,
    command: UpdateUserProfileCommand,
  ): Promise<User> {
    const user = await this.users.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.users.updateProfile(userId, {
      displayName: command.displayName?.trim(),
      locale: command.locale,
    });
  }
}
