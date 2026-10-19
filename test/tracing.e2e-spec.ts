import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { PRICE_INTELLIGENCE_QUEUE } from '../src/price-intelligence/infrastructure/price-intelligence.queue.js';
import request from 'supertest';
import type { App } from 'supertest/types';

interface ExportedSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
}

/** OTLP span kinds, as numbers on the wire. */
const SERVER = 2;
const CONSUMER = 5;

/**
 * Tracing end to end: the app exports over OTLP/HTTP to a collector stood up
 * by the test, and the test reads back what arrived — a request's span, the
 * database queries under it, and the job it queued continuing the same trace.
 */
describe('Tracing (e2e)', () => {
  let collector: Server;
  const received: ExportedSpan[] = [];
  let app: INestApplication<App>;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    collector = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        const payload = JSON.parse(body) as {
          resourceSpans: { scopeSpans: { spans: ExportedSpan[] }[] }[];
        };
        for (const resource of payload.resourceSpans) {
          for (const scope of resource.scopeSpans) {
            received.push(...scope.spans);
          }
        }
        res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
      });
    });
    await new Promise<void>((resolve) => collector.listen(0, '127.0.0.1', resolve));
    const { port } = collector.address() as AddressInfo;

    // Before the app module is loaded: configuration is read when it is.
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = `http://127.0.0.1:${port}`;
    const { createTestApp, registerWithRole, resetDatabase } = await import(
      './helpers/test-app.js'
    );

    app = (await createTestApp()) as INestApplication<App>;
    await resetDatabase(app);

    const admin = (await registerWithRole(app, 'ADMIN')).accessToken;
    const auth = { authorization: `Bearer ${admin}` };

    const categoryId = (
      await http().post('/v1/categories').set(auth).send({ name: 'Bebidas' }).expect(201)
    ).body.id;
    const productId = (
      await http()
        .post('/v1/products')
        .set(auth)
        .send({ name: 'Agua 2L', categoryId, unit: 'UNIT' })
        .expect(201)
    ).body.id;
    const supermarketId = (
      await http().post('/v1/supermarkets').set(auth).send({ name: 'Día' }).expect(201)
    ).body.id;
    const storeId = (
      await http()
        .post('/v1/stores')
        .set(auth)
        .send({
          supermarketId,
          name: 'Día Almagro',
          addressLine: 'Av. Corrientes 4000',
          city: 'Buenos Aires',
          country: 'AR',
          latitude: -34.6037,
          longitude: -58.42,
        })
        .expect(201)
    ).body.id;

    // A report queues a recompute of the product's price at the store: work
    // the request sets off but does not wait for.
    tracedRequest = await http()
      .post('/v1/price-observations')
      .set(auth)
      .send({ productId, storeId, priceCents: 350, currency: 'ARS' })
      .expect(201);

    // The recompute is debounced by a few seconds; wait for the worker to
    // finish it, so its span exists before the app is closed and flushed.
    const queue = app.get<Queue>(getQueueToken(PRICE_INTELLIGENCE_QUEUE));
    const jobId = `recompute-price-${productId}-${storeId}`;
    const deadline = Date.now() + 20_000;
    while ((await queue.getJob(jobId)) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }, 40_000);

  let tracedRequest: request.Response;

  afterAll(async () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    await new Promise<void>((resolve) => collector.close(() => resolve()));
  });

  /** Closing the app flushes the batch of spans still buffered. */
  const flush = async () => {
    await app.close();
  };

  it('exports the request, its queries and the job it queued as one trace', async () => {
    await flush();

    const traceId = tracedRequest.headers['x-trace-id'];
    const inTrace = received.filter((span) => span.traceId === traceId);

    const server = inTrace.filter((span) => span.kind === SERVER);
    expect(server).toHaveLength(1);
    expect(server[0].name).toBe('POST /v1/price-observations');

    // The database work done for the request hangs off the same trace.
    expect(inTrace.some((span) => span.name.startsWith('prisma:'))).toBe(true);

    // And so does the worker that ran the job the request queued.
    expect(
      inTrace.some(
        (span) => span.kind === CONSUMER && span.name.includes(PRICE_INTELLIGENCE_QUEUE),
      ),
    ).toBe(true);
  });
});
