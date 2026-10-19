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

  get priceObservationRetentionDays(): number {
    return this.get('PRICE_OBSERVATION_RETENTION_DAYS');
  }

  get optimizationRetentionDays(): number {
    return this.get('OPTIMIZATION_RETENTION_DAYS');
  }

  /** JSON logs unless explicitly asked for pretty ones, except in development. */
  get structuredLogs(): boolean {
    const configured = this.config.get('LOG_FORMAT', { infer: true });

    return configured ? configured === 'json' : this.nodeEnv !== 'development';
  }

  get trustProxyHops(): number {
    return this.get('TRUST_PROXY_HOPS');
  }

  get maxRequestBodyBytes(): number {
    return this.get('MAX_REQUEST_BODY_KB') * 1024;
  }

  /** Null when no mail server is configured, which turns email off. */
  get smtpUrl(): string | null {
    return this.get('SMTP_URL') ?? null;
  }

  get emailFrom(): string {
    return this.get('EMAIL_FROM');
  }

  get publicBaseUrl(): string {
    return this.get('PUBLIC_BASE_URL').replace(/\/+$/, '');
  }

  get notificationRetentionDays(): number {
    return this.get('NOTIFICATION_RETENTION_DAYS');
  }

  get evidenceStorageDriver(): AppConfig['EVIDENCE_STORAGE_DRIVER'] {
    return this.get('EVIDENCE_STORAGE_DRIVER');
  }

  get evidenceStorageDir(): string {
    return this.get('EVIDENCE_STORAGE_DIR');
  }

  /** The evidence object store. Only meaningful when the driver is `s3`. */
  get evidenceS3(): {
    bucket: string;
    region: string;
    endpoint: string | null;
    forcePathStyle: boolean;
    credentials: { accessKeyId: string; secretAccessKey: string } | null;
  } {
    const accessKeyId = this.get('EVIDENCE_S3_ACCESS_KEY_ID');
    const secretAccessKey = this.get('EVIDENCE_S3_SECRET_ACCESS_KEY');

    return {
      // Validation guarantees a bucket whenever the driver is `s3`.
      bucket: this.get('EVIDENCE_S3_BUCKET') ?? '',
      region: this.get('EVIDENCE_S3_REGION'),
      endpoint: this.get('EVIDENCE_S3_ENDPOINT') ?? null,
      forcePathStyle: this.get('EVIDENCE_S3_FORCE_PATH_STYLE'),
      credentials:
        accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : null,
    };
  }

  /** Bearer token for one external source, when one is configured. */
  externalSourceToken(slug: string): string | null {
    return this.get('EXTERNAL_SOURCE_TOKENS')[slug] ?? null;
  }

  get externalSourceSandboxDir(): string {
    return this.get('EXTERNAL_SOURCE_SANDBOX_DIR');
  }

  get swaggerEnabled(): boolean {
    return this.get('SWAGGER_ENABLED');
  }
}
