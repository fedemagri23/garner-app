import type {
  CreateUserInput,
  User,
  UserWithCredentials,
} from './user.entity.js';

/**
 * The users module's public data contract. Other modules (auth, and later
 * shopping and notifications) depend on this interface; nothing outside
 * `users/infrastructure` may query the users table directly.
 */
export interface UserRepository {
  findById(id: string): Promise<User | null>;
  /** The one place credentials leave the module, for the login path only. */
  findByEmailWithCredentials(email: string): Promise<UserWithCredentials | null>;
  create(input: CreateUserInput): Promise<User>;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
