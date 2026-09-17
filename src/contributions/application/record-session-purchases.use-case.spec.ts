import { NotFoundException } from '@nestjs/common';
import type { IngestPriceObservationService } from '../../pricing/application/ingest-price-observation.service.js';
import type {
  ShoppingSession,
  ShoppingSessionItem,
} from '../../shopping-sessions/domain/shopping-session.entity.js';
import type { ShoppingSessionRepository } from '../../shopping-sessions/domain/shopping-session.repository.port.js';
import type {
  ContributionJobs,
  SessionContributionLedger,
} from '../domain/session-contribution.port.js';
import { ReconcileSessionContributionsUseCase } from './reconcile-session-contributions.use-case.js';
import { RecordSessionPurchasesUseCase } from './record-session-purchases.use-case.js';

const completedAt = new Date('2026-09-17T11:00:00Z');

const line = (overrides: Partial<ShoppingSessionItem>): ShoppingSessionItem => ({
  id: 'line',
  sessionId: 'session-1',
  sourceListItemId: null,
  productId: 'product-1',
  quantity: 1,
  notes: null,
  expectedUnitPriceCents: 125,
  actualUnitPriceCents: 132,
  storeId: 'store-1',
  isPurchased: true,
  purchasedAt: new Date('2026-09-17T10:30:00Z'),
  position: 1000,
  ...overrides,
});

const session = (
  items: ShoppingSessionItem[],
  status: ShoppingSession['status'] = 'COMPLETED',
): ShoppingSession => ({
  id: 'session-1',
  ownerId: 'user-1',
  listId: 'list-1',
  listName: 'Weekly',
  currency: 'ARS',
  storeId: 'store-1',
  status,
  startedAt: new Date('2026-09-17T10:00:00Z'),
  pausedAt: null,
  completedAt: status === 'COMPLETED' ? completedAt : null,
  abandonedAt: null,
  items,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('RecordSessionPurchasesUseCase', () => {
  let sessions: { findById: jest.Mock };
  let ledger: jest.Mocked<SessionContributionLedger>;
  let ingestion: { ingest: jest.Mock };
  let useCase: RecordSessionPurchasesUseCase;

  beforeEach(() => {
    sessions = { findById: jest.fn() };
    ledger = {
      isRecorded: jest.fn().mockResolvedValue(false),
      recordedAmong: jest.fn(),
      record: jest.fn(),
    };
    ingestion = { ingest: jest.fn().mockResolvedValue({ created: true }) };

    useCase = new RecordSessionPurchasesUseCase(
      sessions as unknown as ShoppingSessionRepository,
      ledger,
      ingestion as unknown as IngestPriceObservationService,
    );
  });

  it('turns each purchased line with an actual price into a confirmed-purchase observation', async () => {
    sessions.findById.mockResolvedValue(session([line({ id: 'milk' })]));

    await expect(useCase.execute('session-1')).resolves.toEqual({
      kind: 'recorded',
      observationCount: 1,
      skippedCount: 0,
    });

    expect(ingestion.ingest).toHaveBeenCalledWith({
      productId: 'product-1',
      storeId: 'store-1',
      priceCents: 132,
      currency: 'ARS',
      observedAt: new Date('2026-09-17T10:30:00Z'),
      sourceType: 'PURCHASE_CONFIRMED',
      userId: 'user-1',
      shoppingSessionId: 'session-1',
      dedupeKey: 'purchase:milk',
    });
  });

  it('ignores lines not bought, and skips bought lines it cannot price or place', async () => {
    sessions.findById.mockResolvedValue(
      session([
        line({ id: 'not-bought', isPurchased: false }),
        line({ id: 'confirmed-without-price', actualUnitPriceCents: null }),
        line({ id: 'no-store', storeId: null }),
        line({ id: 'priced' }),
      ]),
    );

    await expect(useCase.execute('session-1')).resolves.toEqual({
      kind: 'recorded',
      observationCount: 1,
      skippedCount: 2,
    });
    expect(ingestion.ingest).toHaveBeenCalledTimes(1);
  });

  it('falls back to the completion time for a line with no purchase time', async () => {
    sessions.findById.mockResolvedValue(session([line({ purchasedAt: null })]));

    await useCase.execute('session-1');

    expect(ingestion.ingest.mock.calls[0][0].observedAt).toBe(completedAt);
  });

  it('skips a line the pipeline refuses without failing the trip', async () => {
    sessions.findById.mockResolvedValue(
      session([line({ id: 'gone-store' }), line({ id: 'fine' })]),
    );
    ingestion.ingest
      .mockRejectedValueOnce(new NotFoundException('Store not found'))
      .mockResolvedValueOnce({ created: true });

    await expect(useCase.execute('session-1')).resolves.toMatchObject({
      observationCount: 1,
      skippedCount: 1,
    });
    expect(ledger.record).toHaveBeenCalled();
  });

  it('lets an infrastructure failure propagate so the job retries, and records nothing', async () => {
    sessions.findById.mockResolvedValue(session([line({})]));
    ingestion.ingest.mockRejectedValue(new Error('connection reset'));

    await expect(useCase.execute('session-1')).rejects.toThrow('connection reset');
    expect(ledger.record).not.toHaveBeenCalled();
  });

  it('does nothing for a trip already recorded', async () => {
    ledger.isRecorded.mockResolvedValue(true);

    await expect(useCase.execute('session-1')).resolves.toEqual({
      kind: 'already-recorded',
    });
    expect(sessions.findById).not.toHaveBeenCalled();
  });

  it.each(['ACTIVE', 'PAUSED', 'ABANDONED'] as const)(
    'does not contribute from a %s trip',
    async (status) => {
      sessions.findById.mockResolvedValue(session([line({})], status));

      await expect(useCase.execute('session-1')).resolves.toEqual({
        kind: 'not-completed',
      });
      expect(ingestion.ingest).not.toHaveBeenCalled();
      expect(ledger.record).not.toHaveBeenCalled();
    },
  );
});

describe('ReconcileSessionContributionsUseCase', () => {
  it('queues only completed trips that have no ledger entry', async () => {
    const sessions = {
      findCompletedIdsBetween: jest.fn().mockResolvedValue(['a', 'b', 'c']),
    };
    const ledger = {
      recordedAmong: jest.fn().mockResolvedValue(new Set(['b'])),
    };
    const jobs: jest.Mocked<ContributionJobs> = {
      enqueueSessionPurchases: jest.fn(),
    };

    const useCase = new ReconcileSessionContributionsUseCase(
      sessions as unknown as ShoppingSessionRepository,
      ledger as unknown as SessionContributionLedger,
      jobs,
    );

    const now = new Date('2026-09-17T12:00:00Z');
    await expect(useCase.execute(now)).resolves.toBe(2);

    expect(jobs.enqueueSessionPurchases.mock.calls).toEqual([['a'], ['c']]);

    // Leaves the most recent few minutes to the live event path.
    const [from, to] = sessions.findCompletedIdsBetween.mock.calls[0];
    expect(to.getTime()).toBeLessThan(now.getTime());
    expect(from.getTime()).toBeLessThan(to.getTime());
  });
});
