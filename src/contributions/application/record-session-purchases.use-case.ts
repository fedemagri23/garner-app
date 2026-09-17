import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { IngestPriceObservationService } from '../../pricing/application/ingest-price-observation.service.js';
import { PriceSourceType } from '../../pricing/domain/price-observation.entity.js';
import {
  SHOPPING_SESSION_REPOSITORY,
  type ShoppingSessionRepository,
} from '../../shopping-sessions/domain/shopping-session.repository.port.js';
import {
  SESSION_CONTRIBUTION_LEDGER,
  type SessionContributionLedger,
} from '../domain/session-contribution.port.js';

export type RecordSessionPurchasesOutcome =
  | { kind: 'already-recorded' }
  | { kind: 'not-completed' }
  | { kind: 'recorded'; observationCount: number; skippedCount: number };

/**
 * The preferred crowdsourcing path: every purchased line of a completed trip
 * that carries an actual price becomes a PURCHASE_CONFIRMED observation,
 * with no extra action from the shopper.
 *
 * Runs as a background job and is safe to run any number of times for one
 * trip. Each line's observation is keyed by the line's id, so a retry after a
 * partial run adds only what is missing; the ledger entry written at the end
 * makes later runs a no-op.
 *
 * Only completed trips contribute. An abandoned trip is not a confirmed
 * purchase, and a line confirmed without typing a price only restates the
 * shopper's own earlier expectation, which is not an observation of anything.
 */
@Injectable()
export class RecordSessionPurchasesUseCase {
  private readonly logger = new Logger(RecordSessionPurchasesUseCase.name);

  constructor(
    @Inject(SHOPPING_SESSION_REPOSITORY)
    private readonly sessions: ShoppingSessionRepository,
    @Inject(SESSION_CONTRIBUTION_LEDGER)
    private readonly ledger: SessionContributionLedger,
    private readonly ingestion: IngestPriceObservationService,
  ) {}

  async execute(sessionId: string): Promise<RecordSessionPurchasesOutcome> {
    if (await this.ledger.isRecorded(sessionId)) {
      return { kind: 'already-recorded' };
    }

    const session = await this.sessions.findById(sessionId);

    if (!session || session.status !== 'COMPLETED' || !session.completedAt) {
      return { kind: 'not-completed' };
    }

    let observationCount = 0;
    let skippedCount = 0;

    for (const item of session.items) {
      if (!item.isPurchased) {
        continue;
      }

      if (item.actualUnitPriceCents === null || item.storeId === null) {
        skippedCount += 1;
        continue;
      }

      try {
        await this.ingestion.ingest({
          productId: item.productId,
          storeId: item.storeId,
          priceCents: item.actualUnitPriceCents,
          currency: session.currency,
          observedAt: item.purchasedAt ?? session.completedAt,
          sourceType: PriceSourceType.PurchaseConfirmed,
          userId: session.ownerId,
          shoppingSessionId: session.id,
          dedupeKey: `purchase:${item.id}`,
        });

        observationCount += 1;
      } catch (error) {
        // A line the pipeline refuses (a store since deleted, a price of zero)
        // will be refused on every retry too; skip it rather than failing the
        // whole trip. Anything else — a database outage — propagates, and the
        // job retries.
        if (!(error instanceof HttpException)) {
          throw error;
        }

        skippedCount += 1;
        this.logger.warn(
          `Skipped purchase line ${item.id} of session ${session.id}: ${error.message}`,
        );
      }
    }

    await this.ledger.record({
      sessionId: session.id,
      userId: session.ownerId,
      observationCount,
      skippedCount,
    });

    return { kind: 'recorded', observationCount, skippedCount };
  }
}
