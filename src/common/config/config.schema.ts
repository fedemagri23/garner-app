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

  // Connections each process keeps per database (three databases, so three
  // pools). The HTTP handlers and the in-process workers share them; size
  // against Postgres's max_connections across every instance.
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(200).default(10),

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

  // The mail server notifications are emailed through, e.g.
  // smtp://user:pass@smtp.example.com:587. Unset, email is not offered at all
  // and the in-app inbox is the only channel.
  SMTP_URL: z.url().optional(),
  EMAIL_FROM: z.string().min(3).default('Garner <alerts@garner.local>'),

  // Expo's push service, which hands messages on to Apple and Google. The
  // default is Expo's own; override it to point at a stand-in in tests. The
  // access token is only needed if "enhanced security" is on for the project.
  EXPO_PUSH_URL: z.url().default('https://exp.host/--/api/v2/push/send'),
  EXPO_ACCESS_TOKEN: z.string().min(1).optional(),

  // Open Food Facts, asked for what a barcode is when a shopper adds a
  // product. Override the URL to point at a stand-in in tests. They ask every
  // client to identify itself: "AppName/Version (contact)".
  OPEN_FOOD_FACTS_URL: z.url().default('https://world.openfoodfacts.org'),
  OPEN_FOOD_FACTS_USER_AGENT: z.string().min(3).default('Garner/0.1 (https://github.com/fedemagri23/garner-app)'),

  // Where this API is reachable from outside, for links in emails.
  PUBLIC_BASE_URL: z.url().default('http://localhost:3000'),

  // Optimizations are snapshots of prices that have since moved; past this
  // they are neither actionable nor interesting.
  OPTIMIZATION_RETENTION_DAYS: z.coerce.number().int().min(1).default(30),

  // Browser origins allowed to call the API, comma-separated — the Expo web
  // target in development (http://localhost:8081), a web app later. Native
  // apps send no Origin and need none of this; unset, CORS stays off.
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((raw) =>
      raw
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url())),

  // Structured JSON logs. On by default outside development, where readable
  // console output is worth more than machine-parseable lines.
  LOG_FORMAT: z.enum(['json', 'pretty']).optional(),

  // OpenTelemetry. Trace ids exist and propagate (requests, jobs, logs)
  // either way; spans are exported over OTLP/HTTP only when an endpoint is
  // set, e.g. http://otel-collector:4318.
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
  OTEL_SERVICE_NAME: z.string().min(1).default('garner-api'),
  // Share of new traces exported. A trace continued from a caller follows
  // the caller's decision, so one trace is never half-exported.
  OTEL_TRACES_SAMPLE_RATIO: z.coerce.number().min(0).max(1).default(1),

  // How many proxies sit in front of the API. Wrong here means `req.ip` is a
  // load balancer's address, and per-IP rate limiting stops working.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),

  // Largest accepted request body. Evidence photos have their own upload
  // route and limit; nothing else needs to be large.
  MAX_REQUEST_BODY_KB: z.coerce.number().int().min(16).max(4_096).default(256),

  // Where evidence photos are kept. `local` is one directory on this host and
  // suits development and a single instance; `s3` is any S3-compatible object
  // store, and is what more than one instance needs.
  EVIDENCE_STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),

  // Where the local-disk evidence store keeps uploaded photos.
  EVIDENCE_STORAGE_DIR: z.string().min(1).default('var/evidence'),

  // The object store, when the driver is `s3`. The endpoint is only for a
  // non-AWS provider (R2, MinIO, a local mock); credentials, when omitted,
  // come from the SDK's default chain — an instance or task role in AWS.
  EVIDENCE_S3_BUCKET: z.string().min(1).optional(),
  EVIDENCE_S3_REGION: z.string().min(1).default('us-east-1'),
  EVIDENCE_S3_ENDPOINT: z.url().optional(),
  EVIDENCE_S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  EVIDENCE_S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  EVIDENCE_S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),

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
}).superRefine((config, ctx) => {
  if (config.EVIDENCE_STORAGE_DRIVER === 's3' && !config.EVIDENCE_S3_BUCKET) {
    ctx.addIssue({
      code: 'custom',
      path: ['EVIDENCE_S3_BUCKET'],
      message: 'is required when EVIDENCE_STORAGE_DRIVER is s3',
    });
  }

  // Half a key pair would silently fall back to the default chain.
  if (
    Boolean(config.EVIDENCE_S3_ACCESS_KEY_ID) !==
    Boolean(config.EVIDENCE_S3_SECRET_ACCESS_KEY)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['EVIDENCE_S3_SECRET_ACCESS_KEY'],
      message: 'EVIDENCE_S3_ACCESS_KEY_ID and EVIDENCE_S3_SECRET_ACCESS_KEY go together',
    });
  }
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
