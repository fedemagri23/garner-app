import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../common/config/app-config.service.js';
import { RedisService } from '../../common/redis/redis.service.js';

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window counter in Redis.
 *
 * Redis rather than in-process memory because the API runs as more than one
 * instance: a per-process counter would multiply the effective limit by the
 * instance count and drift as instances scale.
 *
 * Fixed windows admit a burst of up to 2x the limit across a window boundary.
 * That is an accepted trade for O(1) work per request; the anti-abuse rules in
 * Phase 4 add the per-user, per-product controls where precision matters.
 */
@Injectable()
export class RedisRateLimiter {
  private readonly logger = new Logger(RedisRateLimiter.name);

  constructor(
    private readonly redis: RedisService,
    private readonly config: AppConfigService,
  ) {}

  async hit(identity: string): Promise<RateLimitDecision> {
    const windowMs = this.config.rateLimitWindowMs;
    const limit = this.config.rateLimitMax;
    const window = Math.floor(Date.now() / windowMs);
    const key = `ratelimit:${identity}:${window}`;

    try {
      const results = await this.redis.client
        .multi()
        .incr(key)
        .pexpire(key, windowMs)
        .exec();

      const count = Number(results?.[0]?.[1] ?? 0);

      return {
        allowed: count <= limit,
        limit,
        remaining: Math.max(0, limit - count),
        retryAfterSeconds: Math.ceil(
          ((window + 1) * windowMs - Date.now()) / 1000,
        ),
      };
    } catch (error) {
      // Fail open: rate limiting protects capacity, it does not authorize
      // anyone. Turning a Redis blip into a total outage would be a worse
      // failure than briefly serving unthrottled traffic.
      this.logger.error(
        `Rate limit check failed, allowing request: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        allowed: true,
        limit,
        remaining: limit,
        retryAfterSeconds: 0,
      };
    }
  }
}
