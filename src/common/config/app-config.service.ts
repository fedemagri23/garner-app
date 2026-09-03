import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from './config.schema.js';

/**
 * Typed read access to validated configuration. Injecting this rather than
 * ConfigService keeps key names in one place and gives call sites real types
 * instead of `string | undefined`.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config.get(key, { infer: true });
  }

  get nodeEnv(): AppConfig['NODE_ENV'] {
    return this.get('NODE_ENV');
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get isTest(): boolean {
    return this.nodeEnv === 'test';
  }

  get port(): number {
    return this.get('PORT');
  }

  get coreDbUrl(): string {
    return this.get('CORE_DB_URL');
  }

  get pricingDbUrl(): string {
    return this.get('PRICING_DB_URL');
  }

  get intelligenceDbUrl(): string {
    return this.get('INTELLIGENCE_DB_URL');
  }

  get redisUrl(): string {
    return this.get('REDIS_URL');
  }

  get jwtSecret(): string {
    return this.get('JWT_SECRET');
  }

  get jwtAccessTtlSeconds(): number {
    return this.get('JWT_ACCESS_TTL_SECONDS');
  }

  get jwtRefreshTtlDays(): number {
    return this.get('JWT_REFRESH_TTL_DAYS');
  }

  get rateLimitWindowMs(): number {
    return this.get('RATE_LIMIT_WINDOW_MS');
  }

  get rateLimitMax(): number {
    return this.get('RATE_LIMIT_MAX');
  }

  get swaggerEnabled(): boolean {
    return this.get('SWAGGER_ENABLED');
  }
}
