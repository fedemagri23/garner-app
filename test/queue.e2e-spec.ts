import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SystemQueueService } from '../src/common/queue/system-queue.service.js';
import { createTestApp } from './helpers/test-app.js';

/** Polls for the worker's side effect rather than sleeping a fixed duration. */
async function waitForPing(
  queue: SystemQueueService,
  token: string,
  timeoutMs = 10_000,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await queue.readPingResult(token);
    if (result) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return null;
}

describe('Background jobs (e2e)', () => {
  let app: INestApplication;
  let queue: SystemQueueService;

  beforeAll(async () => {
    app = await createTestApp();
    queue = app.get(SystemQueueService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('enqueues a job and the worker processes it', async () => {
    const token = randomUUID();

    await queue.enqueuePing(token);

    expect(await waitForPing(queue, token)).not.toBeNull();
  });

  it('collapses a repeated enqueue of the same job rather than duplicating it', async () => {
    const token = randomUUID();

    // Jobs are keyed by token, so an at-least-once producer (a retried HTTP
    // handler, a redelivered upstream message) cannot double-process.
    await queue.enqueuePing(token);
    await queue.enqueuePing(token);

    expect(await waitForPing(queue, token)).not.toBeNull();
  });

  it('leaves no result for a token that was never enqueued', async () => {
    expect(await queue.readPingResult(randomUUID())).toBeNull();
  });
});
