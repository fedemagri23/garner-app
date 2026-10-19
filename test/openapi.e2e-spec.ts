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

  it('gives every nullable field its real type', () => {
    // A `string | null` property loses its type to reflection and is
    // described as a bare object, which a generated client cannot read.
    const schemas = buildOpenApiDocument(app).components?.schemas ?? {};
    const untyped = Object.entries(schemas).flatMap(([name, schema]) =>
      Object.entries(
        ('properties' in schema ? schema.properties : undefined) ?? {},
      )
        .filter(
          ([, property]) =>
            'type' in property &&
            property.type === 'object' &&
            !property.properties &&
            !property.allOf,
        )
        .map(([field]) => `${name}.${field}`),
    );

    // Adapter configuration is a free-form object on purpose.
    expect(untyped.filter((field) => !field.endsWith('.config'))).toEqual([]);
  });

  it('puts every route under /v1', () => {
    const paths = Object.keys(buildOpenApiDocument(app).paths);

    expect(paths.length).toBeGreaterThan(50);
    expect(paths.filter((path) => !path.startsWith('/v1/'))).toEqual([]);
  });
});
