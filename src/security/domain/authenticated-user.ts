import { ForbiddenException } from '@nestjs/common';
import type { UserRole } from './user-role.js';

/** The caller identity a guard attaches to the request after verifying a token. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}

/**
 * The single ownership rule for the whole system: a resource belongs to the
 * caller, or an administrator is acting on it. Use cases call this before
 * mutating anything user-owned (shopping lists, sessions, alerts) rather than
 * re-implementing the comparison and getting it subtly wrong.
 *
 * Throws rather than returning a boolean so a forgotten `if` cannot silently
 * authorize the request.
 */
export function assertOwnership(
  resourceOwnerId: string,
  actor: AuthenticatedUser,
): void {
  if (actor.id === resourceOwnerId) {
    return;
  }

  if (actor.role === 'ADMIN') {
    return;
  }

  // Deliberately the same message a missing resource would produce, so this
  // cannot be used to probe which ids exist.
  throw new ForbiddenException('You do not have access to this resource');
}
