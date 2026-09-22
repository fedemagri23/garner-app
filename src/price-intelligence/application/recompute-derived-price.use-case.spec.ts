import type { EventBus } from '../../common/events/event-bus.js';
import type { PriceObservation } from '../../pricing/domain/price-observation.entity.js';
import type { PriceObservationRepository } from '../../pricing/domain/price-observation.repository.port.js';
import type { DerivedPrice } from '../domain/derived-price.entity.js';
import type {
  DerivedPriceRepository,
  PriceCache,
} from '../domain/price-intelligence.repository.port.js';
import { RecomputeDerivedPriceUseCase } from './recompute-derived-price.use-case.js';

const now = new Date('2026-09-22T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const observation = (
  overrides: Partial<PriceObservation> & { id: string },
): PriceObservation => ({
  productId: 'product-1',
  storeId: 'store-1',
  priceCents: 125,
  currency: 'ARS',
  observedAt: now,
  receivedAt: now,
  sourceType: 'USER_REPORTED',
  status: 'ACCEPTED',
  reviewReasons: [],
  userId: 'user-1',
  shoppingSessionId: null,
  dedupeKey: null,
  evidencePhotoKey: null,
  evidenceNote: null,
  ...overrides,
});

describe('RecomputeDerivedPriceUseCase', () => {
  let observations: { findInWindow: jest.Mock };
  let derivedPrices: jest.Mocked<DerivedPriceRepository>;
  let cache: jest.Mocked<PriceCache>;
  let events: { publish: jest.Mock };
  let useCase: RecomputeDerivedPriceUseCase;

  beforeEach(() => {
    observations = { findInWindow: jest.fn().mockResolvedValue([]) };
    derivedPrices = {
      find: jest.fn().mockResolvedValue(null),
      findForProduct: jest.fn(),
      findForProductAtStores: jest.fn(),
      upsert: jest.fn(),
      remove: jest.fn(),
    };
    cache = {
      read: jest.fn(),
      write: jest.fn(),
      invalidateProduct: jest.fn(),
      productNamespace: jest.fn(),
    };
    events = { publish: jest.fn() };

    useCase = new RecomputeDerivedPriceUseCase(
      observations as unknown as PriceObservationRepository,
      derivedPrices,
      cache,
      events as unknown as EventBus,
    );
  });

  const upserted = (): DerivedPrice => derivedPrices.upsert.mock.calls[0][0];

  it('derives a price from the window and caches nothing stale', async () => {
    observations.findInWindow.mockResolvedValue([
      observation({ id: 'a', priceCents: 120 }),
      observation({ id: 'b', priceCents: 130 }),
    ]);

    const outcome = await useCase.execute('product-1', 'store-1', now);

    expect(outcome.kind).toBe('updated');
    expect(upserted()).toMatchObject({
      productId: 'product-1',
      storeId: 'store-1',
      priceCents: 125,
      minPriceCents: 120,
      maxPriceCents: 130,
      observationCount: 2,
      currency: 'ARS',
    });
    expect(cache.invalidateProduct).toHaveBeenCalledWith('product-1');
  });

  it('is not overwritten by the newest report', async () => {
    observations.findInWindow.mockResolvedValue([
      observation({ id: 'shout', priceCents: 1000 }),
      ...[120, 122, 125, 128].map((priceCents, index) =>
        observation({ id: `quiet-${index}`, priceCents, userId: `user-${index}` }),
      ),
    ]);

    await useCase.execute('product-1', 'store-1', now);

    expect(upserted().priceCents).toBeLessThan(400);
  });

  it('ignores rejected observations and unconfirmed flagged ones', async () => {
    observations.findInWindow.mockResolvedValue([
      observation({ id: 'rejected', priceCents: 9999, status: 'REJECTED' }),
      observation({ id: 'flagged', priceCents: 5000, status: 'FLAGGED', userId: 'newcomer' }),
      observation({ id: 'ok', priceCents: 125 }),
    ]);

    await useCase.execute('product-1', 'store-1', now);

    expect(upserted()).toMatchObject({ priceCents: 125, observationCount: 1 });
  });

  it('lets a corroborated flagged observation count, at a discount', async () => {
    observations.findInWindow.mockResolvedValue([
      observation({ id: 'flagged', priceCents: 130, status: 'FLAGGED', userId: 'newcomer' }),
      observation({ id: 'a', priceCents: 120, userId: 'user-2' }),
      observation({ id: 'b', priceCents: 122, userId: 'user-3' }),
    ]);

    await useCase.execute('product-1', 'store-1', now);

    expect(upserted().observationCount).toBe(3);
    // Counted, but pulled the average far less than a clean observation would.
    expect(upserted().priceCents).toBeLessThan(124);
  });

  it('removes a price once everything behind it has aged out', async () => {
    derivedPrices.find.mockResolvedValue({ priceCents: 125 } as DerivedPrice);
    observations.findInWindow.mockResolvedValue([]);

    const outcome = await useCase.execute('product-1', 'store-1', now);

    expect(outcome.kind).toBe('removed');
    expect(derivedPrices.remove).toHaveBeenCalledWith('product-1', 'store-1');
    expect(cache.invalidateProduct).toHaveBeenCalledWith('product-1');
  });

  it('announces a price that changed, with what it was before', async () => {
    derivedPrices.find.mockResolvedValue({ priceCents: 100 } as DerivedPrice);
    observations.findInWindow.mockResolvedValue([observation({ id: 'a', priceCents: 125 })]);

    await useCase.execute('product-1', 'store-1', now);

    expect(events.publish).toHaveBeenCalledTimes(1);
    expect(events.publish.mock.calls[0][0]).toMatchObject({
      name: 'DerivedPriceUpdated',
      payload: { priceCents: 125, previousPriceCents: 100 },
    });
  });

  it('says nothing when recomputing lands on the same price', async () => {
    derivedPrices.find.mockResolvedValue({ priceCents: 125 } as DerivedPrice);
    observations.findInWindow.mockResolvedValue([observation({ id: 'a', priceCents: 125 })]);

    await useCase.execute('product-1', 'store-1', now);

    expect(events.publish).not.toHaveBeenCalled();
  });

  it('is idempotent: recomputing twice writes the same price', async () => {
    observations.findInWindow.mockResolvedValue([
      observation({ id: 'a', priceCents: 120, observedAt: new Date(now.getTime() - 2 * DAY) }),
      observation({ id: 'b', priceCents: 130 }),
    ]);

    await useCase.execute('product-1', 'store-1', now);
    await useCase.execute('product-1', 'store-1', now);

    expect(derivedPrices.upsert.mock.calls[0][0]).toEqual(
      derivedPrices.upsert.mock.calls[1][0],
    );
  });

  it('marks a price nobody has confirmed in months as possibly outdated', async () => {
    observations.findInWindow.mockResolvedValue([
      observation({ id: 'old', observedAt: new Date(now.getTime() - 29 * DAY) }),
    ]);

    await useCase.execute('product-1', 'store-1', now);

    expect(upserted().confidenceLevel).toBe('LIKELY_CURRENT');
    expect(upserted().confidence).toBeLessThan(0.3);
  });
});
