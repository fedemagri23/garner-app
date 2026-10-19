import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { buildOpenApiDocument } from '../src/app-setup.js';
import { createTestApp } from './helpers/test-app.js';

/**
 * The committed contract is exported from a stripped-down app (no databases,
 * Nest preview mode). This compares it with the document the fully
 * configured app builds, so the export can never quietly describe a
 * different API — wrong prefixes, missing versioning — than the one served.
 */
describe('OpenAPI contract (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('matches what the running app serves', () => {
    const committed: unknown = JSON.parse(readFileSync('openapi.json', 'utf8'));
    const served = JSON.parse(JSON.stringify(buildOpenApiDocument(app)));

    expect(served).toEqual(committed);
  });

  it('puts every route under /v1', () => {
    const paths = Object.keys(buildOpenApiDocument(app).paths);

    expect(paths.length).toBeGreaterThan(50);
    expect(paths.filter((path) => !path.startsWith('/v1/'))).toEqual([]);
  });
});
