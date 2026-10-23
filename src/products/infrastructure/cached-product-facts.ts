import { Logger } from '@nestjs/common';
import type { RedisService } from '../../common/redis/redis.service.js';
import type { ProductFacts, ProductFactsSource } from '../domain/product-facts.js';

const FOUND_TTL_SECONDS = 7 * 24 * 3600;
const MISSING_TTL_SECONDS = 24 * 3600;

/**
 * Keeps what the outside database said about each code, so a product many
 * shoppers scan costs one request: what it knows for a week, what it does
 * not for a day (someone may add it there). Failures are not kept. Redis
 * being down only means asking again.
 *
 * Also what lets a shopper's new product take the database's picture: the
 * server reads the picture from here, never from a link in the request.
 */
export class CachedProductFacts implements ProductFactsSource {
  private readonly logger = new Logger(CachedProductFacts.name);

  constructor(
    private readonly source: ProductFactsSource,
    private readonly redis: RedisService,
    private readonly prefix = 'product-facts',
  ) {}

  async find(code: string): Promise<ProductFacts | null> {
    const key = `${this.prefix}:${code}`;
    try {
      const cached = await this.redis.client.get(key);
      if (cached !== null) return JSON.parse(cached) as ProductFacts | null;
    } catch (error) {
      this.logger.warn(`Reading the facts cache failed: ${(error as Error).message}`);
    }

    const facts = await this.source.find(code);
    try {
      await this.redis.client.set(key, JSON.stringify(facts), 'EX', facts ? FOUND_TTL_SECONDS : MISSING_TTL_SECONDS);
    } catch (error) {
      this.logger.warn(`Writing the facts cache failed: ${(error as Error).message}`);
    }
    return facts;
  }
}
