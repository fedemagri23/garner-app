import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'security:isPublic';

/**
 * Authentication is on by default (JwtAuthGuard is registered globally), so a
 * route is reachable without a token only by saying so explicitly here. New
 * endpoints are therefore protected unless someone opts out on purpose.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
