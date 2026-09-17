import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service.js';
import type { SubmissionCounter } from '../domain/price-observation.repository.port.js';

/**
 * Fixed-window counters in Redis, one pipeline round trip for every key a
 * submission is counted against.
 *
 * Fails open, like the global rate limiter: counts come back as zero when
 * Redis is unavailable. These counters protect data quality, and every
 * observation still goes through deviation checks, which live in the database.
 */
@Injectable()
export class RedisSubmissionCounter implements SubmissionCounter {
  private readonly logger = new Logger(RedisSubmissionCounter.name);

  constructor(private readonly redis: RedisService) {}

  async hit(keys: { key: string; windowSeconds: number }[]): Promise<number[]> {
    const nowSeconds = Math.floor(Date.now() / 1000);

    try {
      const pipeline = this.redis.client.multi();

      for (const { key, windowSeconds } of keys) {
        const window = Math.floor(nowSeconds / windowSeconds);
        const windowKey = `${key}:${window}`;
        pipeline.incr(windowKey).expire(windowKey, windowSeconds);
      }

      const results = (await pipeline.exec()) ?? [];

      // Each key contributed an INCR followed by an EXPIRE.
      return keys.map((_, index) => Number(results[index * 2]?.[1] ?? 0));
    } catch (error) {
      this.logger.error(
        `Submission counter unavailable, counting as zero: ${error instanceof Error ? error.message : String(error)}`,
      );
      return keys.map(() => 0);
    }
  }
}
