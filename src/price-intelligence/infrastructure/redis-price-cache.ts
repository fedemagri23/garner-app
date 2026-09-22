import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service.js';
import type { PriceCache } from '../domain/price-intelligence.repository.port.js';

/** Versions outlive cached entries, so they expire slowly rather than never. */
const NAMESPACE_TTL_SECONDS = 24 * 60 * 60;

/**
 * Cached price views in Redis.
 *
 * Invalidation is by version, not by deletion: every key for a product carries
 * a counter that recomputing the product's price increments, so the old
 * entries are simply never read again and expire on their own. Deleting them
 * instead would mean scanning the keyspace on every price change.
 *
 * Every method fails soft. The cache is an optimization over `intelligence_db`,
 * and a Redis outage should cost latency, not availability.
 */
@Injectable()
export class RedisPriceCache implements PriceCache {
  private readonly logger = new Logger(RedisPriceCache.name);

  constructor(private readonly redis: RedisService) {}

  async read<T>(key: string): Promise<T | null> {
    try {
      const cached = await this.redis.client.get(key);
      return cached ? (JSON.parse(cached) as T) : null;
    } catch (error) {
      this.warn('read', error);
      return null;
    }
  }

  async write<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.warn('write', error);
    }
  }

  async invalidateProduct(productId: string): Promise<void> {
    try {
      const key = this.versionKey(productId);
      await this.redis.client.incr(key);
      await this.redis.client.expire(key, NAMESPACE_TTL_SECONDS);
    } catch (error) {
      this.warn('invalidate', error);
    }
  }

  async productNamespace(productId: string): Promise<string> {
    try {
      const version = await this.redis.client.get(this.versionKey(productId));
      return `prices:${productId}:v${version ?? '0'}`;
    } catch (error) {
      this.warn('namespace', error);
      // A namespace nobody writes to: reads miss and go to the database.
      return `prices:${productId}:unversioned`;
    }
  }

  private versionKey(productId: string): string {
    return `prices:${productId}:version`;
  }

  private warn(operation: string, error: unknown): void {
    this.logger.warn(
      `Price cache ${operation} failed, continuing without cache: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
