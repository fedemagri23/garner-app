import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../domain/authenticated-user.js';

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

/**
 * Reads the identity JwtAuthGuard attached to the request. Non-null by
 * construction on guarded routes; on a @Public() route it may be undefined,
 * which the signature reflects.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
  },
);
