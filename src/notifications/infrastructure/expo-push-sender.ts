import { Logger } from '@nestjs/common';
import type {
  PushMessage,
  PushOutcome,
  PushSender,
} from '../domain/notification.repository.port.js';

/** Expo's push service takes at most this many messages in one request. */
const BATCH = 100;
const TIMEOUT_MS = 10_000;

interface Ticket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/**
 * Sends push messages through Expo's push service, which hands them on to
 * Apple and Google. Answers per message — one dead phone does not fail the
 * rest — and throws only when the service itself could not be reached or did
 * not make sense, which is worth retrying later.
 */
export class ExpoPushSender implements PushSender {
  private readonly logger = new Logger(ExpoPushSender.name);

  constructor(
    private readonly url: string,
    private readonly accessToken: string | null,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(messages: PushMessage[]): Promise<PushOutcome[]> {
    const outcomes: PushOutcome[] = [];

    for (let start = 0; start < messages.length; start += BATCH) {
      outcomes.push(...(await this.sendBatch(messages.slice(start, start + BATCH))));
    }

    return outcomes;
  }

  private async sendBatch(batch: PushMessage[]): Promise<PushOutcome[]> {
    const response = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
      },
      body: JSON.stringify(
        batch.map((message) => ({ ...message, sound: 'default', priority: 'high' })),
      ),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`The push service answered ${response.status}`);
    }

    const body = (await response.json()) as { data?: Ticket[] };

    if (!Array.isArray(body.data) || body.data.length !== batch.length) {
      throw new Error('The push service answered something unexpected');
    }

    return body.data.map((ticket, index): PushOutcome => {
      const token = batch[index].to;

      if (ticket.status === 'ok') {
        return { token, status: 'ok' };
      }
      if (ticket.details?.error === 'DeviceNotRegistered') {
        return { token, status: 'invalid' };
      }

      this.logger.warn(`Push to a device refused: ${ticket.message ?? ticket.details?.error ?? 'unknown'}`);
      return { token, status: 'error', message: ticket.message ?? 'The push service refused it' };
    });
  }
}
