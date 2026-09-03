import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { RedisRateLimiter } from '../infrastructure/redis-rate-limiter.js';
import { SKIP_RATE_LIMIT_KEY } from './rate-limit.decorator.js';
import type { RequestWithUser } from './current-user.decorator.js';

/**
 * Registered globally and ordered before JwtAuthGuard, so an unauthenticated
 * flood is rejected before it costs a token verification or a password hash.
 *
 * Because it runs pre-authentication the bucket is keyed by client IP. Phase 4
 * adds the per-user and per-product limits that the price-submission rules
 * need, which can key on the authenticated identity.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RedisRateLimiter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skip) {
      return true;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithUser>();
    const response = http.getResponse<Response>();

    const decision = await this.limiter.hit(this.identify(request));

    response.setHeader('X-RateLimit-Limit', decision.limit);
    response.setHeader('X-RateLimit-Remaining', decision.remaining);

    if (!decision.allowed) {
      response.setHeader('Retry-After', decision.retryAfterSeconds);
      throw new HttpException(
        {
          error: 'Too Many Requests',
          message: 'Rate limit exceeded, please retry later',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private identify(request: RequestWithUser): string {
    // `request.ip` honours trust-proxy settings, so it is the client address
    // rather than the load balancer's once that is configured.
    return request.ip ?? request.socket.remoteAddress ?? 'unknown';
  }
}
