import { ForbiddenException } from '@nestjs/common';
import { assertOwnership, type AuthenticatedUser } from './authenticated-user.js';

const user = (
  id: string,
  role: AuthenticatedUser['role'] = 'USER',
): AuthenticatedUser => ({ id, email: `${id}@example.com`, role });

describe('assertOwnership', () => {
  it('allows the owner', () => {
    expect(() => assertOwnership('user-1', user('user-1'))).not.toThrow();
  });

  it('rejects a different user', () => {
    expect(() => assertOwnership('user-1', user('user-2'))).toThrow(
      ForbiddenException,
    );
  });

  it('allows an administrator acting on someone else’s resource', () => {
    expect(() =>
      assertOwnership('user-1', user('admin-1', 'ADMIN')),
    ).not.toThrow();
  });

  it('does not treat a moderator as an owner', () => {
    // Moderation powers are granted per-feature; they are not blanket
    // ownership over user-owned resources such as lists and sessions.
    expect(() => assertOwnership('user-1', user('mod-1', 'MODERATOR'))).toThrow(
      ForbiddenException,
    );
  });
});
