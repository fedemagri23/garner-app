import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { createDomainEvent } from '../../common/events/domain-event.js';
import {
  DomainEventName,
  type ShoppingSessionCompletedEvent,
} from '../../common/events/event-catalog.js';
import { EventBus } from '../../common/events/event-bus.js';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import {
  decideTransition,
  type SessionAction,
  type ShoppingSession,
} from '../domain/shopping-session.entity.js';
import {
  SHOPPING_SESSION_REPOSITORY,
  type ShoppingSessionRepository,
  type StatusChange,
} from '../domain/shopping-session.repository.port.js';
import { ShoppingSessionAccess } from './shopping-session-access.js';

/**
 * Pause, resume, complete and abandon — each safe to retry.
 *
 * The status write is conditional on the status the decision was made from.
 * If two "complete" requests race, one wins the write and publishes
 * ShoppingSessionCompleted; the other re-reads, finds the trip already
 * completed, and returns it as a replay. The event goes out exactly once.
 */
@Injectable()
export class ChangeSessionStatusUseCase {
  /** A write can only lose to a status change, and there are few states to pass through. */
  private static readonly MAX_ATTEMPTS = 3;

  constructor(
    @Inject(SHOPPING_SESSION_REPOSITORY)
    private readonly sessions: ShoppingSessionRepository,
    private readonly access: ShoppingSessionAccess,
    private readonly events: EventBus,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    sessionId: string,
    action: SessionAction,
  ): Promise<void> {
    for (let attempt = 0; attempt < ChangeSessionStatusUseCase.MAX_ATTEMPTS; attempt++) {
      const session = await this.access.loadOwned(sessionId, actor);
      const outcome = decideTransition(session.status, action);

      if (outcome.kind === 'replay') {
        return;
      }

      if (outcome.kind === 'rejected') {
        throw new ConflictException(outcome.reason);
      }

      const now = new Date();
      const changed = await this.sessions.changeStatus(
        session.id,
        session.status,
        this.changeFor(action, now),
      );

      if (!changed) {
        // Someone else moved the session first; decide again from where it is.
        continue;
      }

      if (action === 'complete') {
        await this.publishCompleted(changed, now);
      }

      return;
    }

    throw new ConflictException(
      'The shopping session changed concurrently; please retry',
    );
  }

  private changeFor(action: SessionAction, now: Date): StatusChange {
    switch (action) {
      case 'pause':
        return { status: 'PAUSED', pausedAt: now };
      case 'resume':
        return { status: 'ACTIVE', pausedAt: null };
      case 'complete':
        return { status: 'COMPLETED', pausedAt: null, completedAt: now };
      case 'abandon':
        return { status: 'ABANDONED', pausedAt: null, abandonedAt: now };
    }
  }

  /**
   * Built from the session as read back inside the completing transaction.
   * Item writes take the same row lock and refuse a closed trip, so every
   * purchase that landed is in this list and none can land after it.
   */
  private async publishCompleted(
    session: ShoppingSession,
    completedAt: Date,
  ): Promise<void> {
    const event: ShoppingSessionCompletedEvent = createDomainEvent(
      DomainEventName.ShoppingSessionCompleted,
      {
        sessionId: session.id,
        ownerId: session.ownerId,
        storeId: session.storeId,
        currency: session.currency,
        completedAt: completedAt.toISOString(),
        purchases: session.items
          .filter((item) => item.isPurchased)
          .map((item) => ({
            productId: item.productId,
            storeId: item.storeId,
            quantity: item.quantity,
            actualUnitPriceCents: item.actualUnitPriceCents,
            expectedUnitPriceCents: item.expectedUnitPriceCents,
            purchasedAt: (item.purchasedAt ?? completedAt).toISOString(),
          })),
      },
    );

    await this.events.publish(event);
  }
}
