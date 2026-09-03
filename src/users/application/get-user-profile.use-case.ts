import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { User } from '../domain/user.entity.js';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../domain/user.repository.port.js';

@Injectable()
export class GetUserProfileUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async execute(userId: string): Promise<User> {
    const user = await this.users.findById(userId);

    if (!user) {
      // Reachable when an account is deleted while an unexpired access token
      // is still in circulation.
      throw new NotFoundException('User not found');
    }

    return user;
  }
}
