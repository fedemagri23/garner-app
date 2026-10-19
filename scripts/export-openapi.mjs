/**
 * Writes the API contract to `openapi.json`, from the compiled app, without
 * a database, Redis or a listening server: Nest's preview mode builds the
 * module graph and the routes without running a single provider.
 *
 *   pnpm run build && pnpm run openapi:export          write the file
 *   pnpm run build && pnpm run openapi:export --check  fail if it is stale
 *
 * The mobile app generates its typed client from this file.
 */
import { readFileSync, writeFileSync } from 'node:fs';

// Configuration is validated when the app module loads, but preview mode
// never connects to anything — so a machine with no .env (CI) gets
// placeholders rather than a refusal.
const placeholders = {
  CORE_DB_URL: 'postgresql://unused@localhost/unused',
  PRICING_DB_URL: 'postgresql://unused@localhost/unused',
  INTELLIGENCE_DB_URL: 'postgresql://unused@localhost/unused',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'openapi-export-placeholder-secret',
};
for (const [name, value] of Object.entries(placeholders)) {
  process.env[name] ??= value;
}

const { NestFactory } = await import('@nestjs/core');
const { AppModule } = await import('../dist/app.module.js');
const { buildOpenApiDocument } = await import('../dist/app-setup.js');

const app = await NestFactory.create(AppModule, { preview: true, logger: false });
app.enableVersioning({ type: 1, defaultVersion: '1' });

const document = buildOpenApiDocument(app);
const json = `${JSON.stringify(document, null, 2)}\n`;
const path = new URL('../openapi.json', import.meta.url);

if (process.argv.includes('--check')) {
  let committed = '';
  try {
    committed = readFileSync(path, 'utf8');
  } catch {}

  if (committed !== json) {
    console.error('openapi.json is out of date: run `pnpm run build && pnpm run openapi:export` and commit it.');
    process.exit(1);
  }
  console.log('openapi.json is up to date.');
} else {
  writeFileSync(path, json);
  console.log(`Wrote openapi.json (${Object.keys(document.paths).length} paths).`);
}

process.exit(0);
