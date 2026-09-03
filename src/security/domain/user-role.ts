/**
 * Authorization vocabulary shared by every module. It lives in security rather
 * than in users so that guards do not have to reach into the identity module,
 * and so the persisted Prisma enum stays an infrastructure detail that the
 * users repository maps onto this type.
 */
export const UserRole = {
  User: 'USER',
  Moderator: 'MODERATOR',
  Admin: 'ADMIN',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const ALL_USER_ROLES: readonly UserRole[] = Object.values(UserRole);
