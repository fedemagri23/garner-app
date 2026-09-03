/**
 * Port for password hashing. Use cases depend on this interface, never on the
 * hashing library, so the algorithm can be upgraded without touching auth.
 */
export interface PasswordHasher {
  hash(plainPassword: string): Promise<string>;
  verify(hash: string, plainPassword: string): Promise<boolean>;
}

export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
