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

  // Delivered notifications are kept this long; they are a read history, not
  // a record anything depends on.
  NOTIFICATION_RETENTION_DAYS: z.coerce.number().int().min(1).default(30),

  // Optimizations are snapshots of prices that have since moved; past this
  // they are neither actionable nor interesting.
  OPTIMIZATION_RETENTION_DAYS: z.coerce.number().int().min(1).default(30),

  // Structured JSON logs. On by default outside development, where readable
  // console output is worth more than machine-parseable lines.
  LOG_FORMAT: z.enum(['json', 'pretty']).optional(),

  // How many proxies sit in front of the API. Wrong here means `req.ip` is a
  // load balancer's address, and per-IP rate limiting stops working.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),

  // Largest accepted request body. Evidence photos have their own upload
  // route and limit; nothing else needs to be large.
  MAX_REQUEST_BODY_KB: z.coerce.number().int().min(16).max(4_096).default(256),

  // Where the local-disk evidence store keeps uploaded photos.
  EVIDENCE_STORAGE_DIR: z.string().min(1).default('var/evidence'),

  // Bearer tokens for external price sources, as {"source-slug":"token"}.
  // Kept here rather than in the source registry row so a credential never
  // lands in the database or in an API response.
  EXTERNAL_SOURCE_TOKENS: z
    .string()
    .default('{}')
    .transform((raw, ctx) => {
      try {
        const parsed: unknown = JSON.parse(raw);

        if (
          typeof parsed !== 'object' ||
          parsed === null ||
          Array.isArray(parsed) ||
          Object.values(parsed).some((value) => typeof value !== 'string')
        ) {
          throw new Error('expected an object of string values');
        }

        return parsed as Record<string, string>;
      } catch (error) {
        ctx.addIssue({
          code: 'custom',
          message: `must be a JSON object of source slug to token (${
            error instanceof Error ? error.message : String(error)
          })`,
        });
        return z.NEVER;
      }
    }),

  // Where the sandbox adapter may read fixture files from. Confines it to one
  // directory, so a source's configuration cannot name any file on the host.
  EXTERNAL_SOURCE_SANDBOX_DIR: z.string().min(1).default('var/sandbox-sources'),

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
