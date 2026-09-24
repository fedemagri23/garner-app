import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp } from './helpers/test-app.js';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = (await createTestApp()) as INestApplication<App>;
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports every backing dependency as reachable', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/health')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      checks: {
        core_db: { status: 'up' },
        pricing_db: { status: 'up' },
        intelligence_db: { status: 'up' },
        redis: { status: 'up' },
        // Workers reachable is a different question from Redis answering a
        // ping: a queue that cannot be read means jobs are not draining.
        queues: { status: 'up' },
      },
    });

    // Depths are reported for operators, and never a reason to fail a probe.
    expect(response.body.queues).toBeDefined();
  });

  it('answers the liveness probe without touching dependencies', async () => {
    await request(app.getHttpServer())
      .get('/v1/health/live')
      .expect(200, { status: 'ok' });
  });

  it('is reachable without authentication', async () => {
    // A probe that needed a token would report the API as down whenever auth
    // was misconfigured, which is exactly when the probe must still answer.
    await request(app.getHttpServer()).get('/v1/health').expect(200);
  });

  it('echoes a caller-supplied request id', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/health/live')
      .set('x-request-id', 'trace-me-123')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('trace-me-123');
  });

  it('mints a request id when the caller does not supply one', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/health/live')
      .expect(200);

    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('sets security headers', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/health/live')
      .expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-dns-prefetch-control']).toBe('off');
  });

  it('serves the unversioned path as 404, proving URI versioning is enforced', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });
});
