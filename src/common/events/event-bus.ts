import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from './domain-event.js';

export type DomainEventHandler<TEvent extends DomainEvent = DomainEvent> = (
  event: TEvent,
) => Promise<void> | void;

/**
 * In-process publish/subscribe for domain events.
 *
 * Deliberately not a distributed broker: the system is one deployable, and the
 * durable-work path is BullMQ. A subscriber that needs retries or durability
 * enqueues a job rather than doing the work inline.
 *
 * A handler that throws is logged and isolated — one broken subscriber must
 * never fail the business operation that published the fact, because the fact
 * already happened.
 */
@Injectable()
export class EventBus {
  private readonly logger = new Logger(EventBus.name);
  private readonly handlers = new Map<string, Set<DomainEventHandler>>();

  subscribe<TEvent extends DomainEvent>(
    eventName: TEvent['name'],
    handler: DomainEventHandler<TEvent>,
  ): () => void {
    const existing = this.handlers.get(eventName) ?? new Set();
    existing.add(handler as DomainEventHandler);
    this.handlers.set(eventName, existing);

    return () => {
      existing.delete(handler as DomainEventHandler);
    };
  }

  async publish<TEvent extends DomainEvent>(event: TEvent): Promise<void> {
    const handlers = this.handlers.get(event.name);

    if (!handlers?.size) {
      this.logger.debug(`${event.name} published with no subscribers`);
      return;
    }

    // The `async` wrapper matters: a handler that throws synchronously would
    // otherwise escape while the array is being built, before allSettled ever
    // sees it. Wrapping turns that into a rejection like any other.
    const results = await Promise.allSettled(
      [...handlers].map(async (handler) => handler(event)),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        const reason: unknown = result.reason;
        const message =
          reason instanceof Error ? reason.stack : String(reason);
        this.logger.error(`Handler for ${event.name} failed: ${message}`);
      }
    }
  }
}
