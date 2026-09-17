import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  SHOPPING_SESSION_REPOSITORY,
  type ShoppingSessionRepository,
} from '../../shopping-sessions/domain/shopping-session.repository.port.js';
import {
  CONTRIBUTION_JOBS,
  SESSION_CONTRIBUTION_LEDGER,
  type ContributionJobs,
  type SessionContributionLedger,
} from '../domain/session-contribution.port.js';

/** How far back the sweep looks for completed trips. */
export const RECONCILE_LOOKBACK_MS = 48 * 60 * 60 * 1000;
/** Trips completed more recently than this are left to the live event path. */
export const RECONCILE_GRACE_MS = 5 * 60 * 1000;
const RECONCILE_BATCH = 500;

/**
 * The safety net under the completion event.
 *
 * ShoppingSessionCompleted travels on the in-process bus, so a crash between
 * the trip's commit and the event's publish would lose it — and with it the
 * trip's contributions. This sweep finds recently completed trips with no
 * ledger entry and queues them, so a lost event delays a contribution rather
 * than dropping it.
 */
@Injectable()
export class ReconcileSessionContributionsUseCase {
  private readonly logger = new Logger(ReconcileSessionContributionsUseCase.name);

  constructor(
    @Inject(SHOPPING_SESSION_REPOSITORY)
    private readonly sessions: ShoppingSessionRepository,
    @Inject(SESSION_CONTRIBUTION_LEDGER)
    private readonly ledger: SessionContributionLedger,
    @Inject(CONTRIBUTION_JOBS) private readonly jobs: ContributionJobs,
  ) {}

  async execute(now: Date = new Date()): Promise<number> {
    const completed = await this.sessions.findCompletedIdsBetween(
      new Date(now.getTime() - RECONCILE_LOOKBACK_MS),
      new Date(now.getTime() - RECONCILE_GRACE_MS),
      RECONCILE_BATCH,
    );

    if (completed.length === 0) {
      return 0;
    }

    const recorded = await this.ledger.recordedAmong(completed);
    const missing = completed.filter((id) => !recorded.has(id));

    for (const sessionId of missing) {
      await this.jobs.enqueueSessionPurchases(sessionId);
    }

    if (missing.length > 0) {
      this.logger.warn(
        `Queued ${missing.length} completed trip(s) with no recorded contribution`,
      );
    }

    return missing.length;
  }
}
