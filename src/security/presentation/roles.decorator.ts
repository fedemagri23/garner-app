import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../domain/user-role.js';

export const ROLES_KEY = 'security:roles';

/** Restricts a route to the listed roles; enforced by RolesGuard. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
