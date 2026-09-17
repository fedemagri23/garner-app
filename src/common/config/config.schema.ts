import { z } from 'zod';

/**
 * Every environment variable the application reads, in one place. Nothing else
 * in the codebase touches process.env: modules take configuration through
 * AppConfigService so a missing or malformed value fails at startup rather
 * than at the first request that happens to need it.
 */
export const configSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  CORE_DB_URL: z.url(),
  PRICING_DB_URL: z.url(),
  INTELLIGENCE_DB_URL: z.url(),

  REDIS_URL: z.url(),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  // Seconds rather than a duration string: unambiguous to read, and it drops
  // straight into `expiresIn` without a units-parsing step.
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),

  // Raw price observations are operational data, not history: long enough for
  // fraud review and recalculation, then pruned.
  PRICE_OBSERVATION_RETENTION_DAYS: z.coerce.number().int().min(1).default(90),

  // Where the local-disk evidence store keeps uploaded photos.
  EVIDENCE_STORAGE_DIR: z.string().min(1).default('var/evidence'),

  SWAGGER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

export type AppConfig = z.infer<typeof configSchema>;

/**
 * Nest's ConfigModule hands us the raw merged environment. Parsing here turns
 * a misconfigured deployment into a startup crash with a readable list of
 * exactly which variables are wrong.
 */
export function validateConfig(raw: Record<string, unknown>): AppConfig {
  const result = configSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return result.data;
}
