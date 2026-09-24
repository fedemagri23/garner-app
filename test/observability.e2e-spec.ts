import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { MetricsService } from '../src/common/observability/metrics.service.js';
import {
  createTestApp,
  registerWithRole,
  resetDatabase,
  uniqueEmail,
} from './helpers/test-app.js';

describe('Observability and hardening (e2e)', () => {
  let app: INestApplication<App>;
  let admin: string;
  let shopper: string;

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = (await createTestApp()) as INestApplication<App>;
    await resetDatabase(app);

    admin = (await registerWithRole(app, 'ADMIN')).accessToken;
    shopper = (
      await http()
        .post('/v1/auth/register')
        .send({
          email: uniqueEmail('observability'),
          password: 'correct-horse-battery',
          displayName: 'Shopper',
        })
        .expect(201)
    ).body.accessToken;
  });

  afterAll(async () => {
    await resetDatabase(app);
    await app.close();
  });

  describe('health', () => {
    it('reports every dependency, including the queues', async () => {
      const response = await http().get('/v1/health').expect(200);

      expect(response.body.status).toBe('ok');
      expect(Object.keys(response.body.checks).sort()).toEqual([
        'core_db',
        'intelligence_db',
        'pricing_db',
        'queues',
        'redis',
      ]);
      expect(response.body.queues).toBeDefined();
    });

    it('answers liveness without touching a dependency', async () => {
      await http().get('/v1/health/live').expect(200);
    });
  });

  describe('metrics', () => {
    it('counts requests by route pattern rather than path', async () => {
      const metrics = app.get(MetricsService);
      metrics.reset();

      await http().get('/v1/users/me').set(auth(shopper)).expect(200);

      const rendered = metrics.render();

      expect(rendered).toContain('garner_http_requests_total');
      expect(rendered).toContain('garner_http_request_duration_ms_count');
      // The pattern, so one product id does not become its own series.
      expect(rendered).toMatch(/route="[^"]*users\/me"/);
    });

    it('serves the scrape endpoint to an administrator', async () => {
      const response = await http()
        .get('/v1/metrics')
        .set(auth(admin))
        .expect(200);

      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.text).toContain('garner_queue_waiting');
    });

    it('is closed to ordinary users and to anonymous callers', async () => {
      await http().get('/v1/metrics').set(auth(shopper)).expect(403);
      await http().get('/v1/metrics').expect(401);
    });
  });

  describe('request correlation', () => {
    it('echoes a request id and a trace id', async () => {
      const response = await http()
        .get('/v1/users/me')
        .set(auth(shopper))
        .expect(200);

      expect(response.headers['x-request-id']).toEqual(expect.any(String));
      expect(response.headers['x-trace-id']).toEqual(expect.any(String));
    });

    it('keeps the caller’s own ids so a trace spans client and API', async () => {
      const response = await http()
        .get('/v1/users/me')
        .set(auth(shopper))
        .set('x-request-id', 'request-from-the-app')
        .set('x-trace-id', 'trace-from-the-app')
        .expect(200);

      expect(response.headers['x-request-id']).toBe('request-from-the-app');
      expect(response.headers['x-trace-id']).toBe('trace-from-the-app');
    });

    it('puts the request id in every error body', async () => {
      const response = await http().get('/v1/users/me').expect(401);

      expect(response.body.requestId).toEqual(expect.any(String));
    });
  });

  describe('hardening', () => {
    it('refuses a body larger than the limit', async () => {
      await http()
        .post('/v1/shopping-lists')
        .set(auth(shopper))
        .send({
          name: 'x'.repeat(400_000),
          currency: 'ARS',
        })
        .expect(413);
    });

    it('rejects unknown properties rather than ignoring them', async () => {
      await http()
        .post('/v1/shopping-lists')
        .set(auth(shopper))
        .send({ name: 'Weekly', currency: 'ARS', ownerId: 'someone-else' })
        .expect(400);
    });

    it('sets the security headers helmet provides', async () => {
      const response = await http().get('/v1/health/live').expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
    });

    it('never leaks an internal error message', async () => {
      const response = await http()
        .get('/v1/optimizations/not-a-uuid')
        .set(auth(shopper))
        .expect(400);

      expect(JSON.stringify(response.body)).not.toMatch(/prisma|sql|stack/i);
    });
  });
});
