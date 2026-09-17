import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  DomainEventName,
  type ShoppingSessionCompletedEvent,
} from '../../common/events/event-catalog.js';
import { EventBus } from '../../common/events/event-bus.js';
import {
  CONTRIBUTION_JOBS,
  type ContributionJobs,
} from '../domain/session-contribution.port.js';

/**
 * Turns a completed trip into queued contribution work. The listener only
 * enqueues: the work itself runs in a worker, where it can retry without
 * holding up the shopper's "finish" request.
 */
@Injectable()
export class SessionCompletedListener implements OnModuleInit {
  constructor(
    private readonly events: EventBus,
    @Inject(CONTRIBUTION_JOBS) private readonly jobs: ContributionJobs,
  ) {}

  onModuleInit(): void {
    this.events.subscribe<ShoppingSessionCompletedEvent>(
      DomainEventName.ShoppingSessionCompleted,
      async (event) => {
        await this.jobs.enqueueSessionPurchases(event.payload.sessionId);
      },
    );
  }
}
