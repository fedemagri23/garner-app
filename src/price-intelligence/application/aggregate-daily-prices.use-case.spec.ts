import type { EventBus } from '../../common/events/event-bus.js';
import type { PriceObservation } from '../../pricing/domain/price-observation.entity.js';
import type { PriceObservationRepository } from '../../pricing/domain/price-observation.repository.port.js';
import type { DailyPriceRecord } from '../domain/derived-price.entity.js';
import type { DailyPriceHistoryRepository } from '../domain/price-intelligence.repository.port.js';
import { AggregateDailyPricesUseCase } from './aggregate-daily-prices.use-case.js';

const day = new Date('2026-09-21T00:00:00Z');

const observation = (
  overrides: Partial<PriceObservation> & { id: string },
): PriceObservation => ({
  productId: 'product-1',
  storeId: 'store-1',
  priceCents: 125,
  currency: 'ARS',
  observedAt: new Date('2026-09-21T10:00:00Z'),
  receivedAt: new Date('2026-09-21T10:00:00Z'),
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

describe('AggregateDailyPricesUseCase', () => {
  let observations: {
    listAggregationTargets: jest.Mock;
    findInWindow: jest.Mock;
  };
  let history: jest.Mocked<DailyPriceHistoryRepository>;
  let events: { publish: jest.Mock };
  let useCase: AggregateDailyPricesUseCase;

  beforeEach(() => {
    observations = {
      // One page of targets, then nothing — and the same again for a re-run,
      // since the day's observations have not gone anywhere.
      listAggregationTargets: jest
        .fn()
        .mockImplementation(async ({ skip }: { skip: number }) =>
          skip === 0
            ? [{ productId: 'product-1', storeId: 'store-1', currency: 'ARS' }]
            : [],
        ),
      findInWindow: jest.fn().mockResolvedValue([observation({ id: 'a' })]),
    };
    history = {
      upsert: jest.fn(),
      findPreviousDay: jest.fn().mockResolvedValue(null),
      findRange: jest.fn(),
    };
    events = { publish: jest.fn() };

    useCase = new AggregateDailyPricesUseCase(
      observations as unknown as PriceObservationRepository,
      history,
      events as unknown as EventBus,
    );
  });

  const written = (): DailyPriceRecord => history.upsert.mock.calls[0][0];

  it('writes one compact row per product and store for the day', async () => {
    observations.findInWindow.mockResolvedValue([
      observation({ id: 'a', priceCents: 120 }),
      observation({ id: 'b', priceCents: 130 }),
      observation({ id: 'c', priceCents: 125 }),
    ]);

    const summary = await useCase.execute(day);

    expect(summary).toMatchObject({ targets: 1, written: 1, anomalies: 0 });
    expect(history.upsert).toHaveBeenCalledTimes(1);
    expect(written()).toMatchObject({
      productId: 'product-1',
      storeId: 'store-1',
      date: day,
      weightedAverageCents: 125,
      minPriceCents: 120,
      maxPriceCents: 130,
      observationCount: 3,
      isAnomalous: false,
    });
  });

  it('asks only for that day’s observations', async () => {
    await useCase.execute(new Date('2026-09-21T17:45:00Z'));

    const [query] = observations.findInWindow.mock.calls[0];
    expect(query.from.toISOString()).toBe('2026-09-21T00:00:00.000Z');
    expect(query.to.toISOString()).toBe('2026-09-22T00:00:00.000Z');
  });

  it('produces the same row whenever it is re-run, so a replay is harmless', async () => {
    await useCase.execute(day);
    await useCase.execute(new Date('2026-09-21T23:00:00Z'));

    expect(history.upsert.mock.calls[0][0]).toEqual(history.upsert.mock.calls[1][0]);
  });

  it('leaves quarantined observations out of the day', async () => {
    observations.findInWindow.mockResolvedValue([
      observation({ id: 'ok', priceCents: 125 }),
      observation({ id: 'bad', priceCents: 9999, status: 'REJECTED' }),
    ]);

    await useCase.execute(day);

    expect(written()).toMatchObject({ weightedAverageCents: 125, observationCount: 1 });
  });

  it('writes no row for a day whose observations were all quarantined', async () => {
    observations.findInWindow.mockResolvedValue([
      observation({ id: 'bad', status: 'REJECTED' }),
    ]);

    const summary = await useCase.execute(day);

    expect(history.upsert).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ targets: 1, written: 0 });
  });

  it('announces each aggregated day', async () => {
    await useCase.execute(day);

    expect(events.publish.mock.calls[0][0]).toMatchObject({
      name: 'DailyPriceCalculated',
      payload: { productId: 'product-1', storeId: 'store-1', date: '2026-09-21' },
    });
  });

  it('flags and announces a day that jumped against the previous one', async () => {
    history.findPreviousDay.mockResolvedValue({
      weightedAverageCents: 100,
    } as DailyPriceRecord);
    observations.findInWindow.mockResolvedValue([observation({ id: 'a', priceCents: 300 })]);

    const summary = await useCase.execute(day);

    expect(written().isAnomalous).toBe(true);
    expect(summary.anomalies).toBe(1);
    expect(events.publish.mock.calls.map(([event]) => event.name)).toContain(
      'PriceAnomalyDetected',
    );
  });

  it('does not call the first day of a price an anomaly', async () => {
    await useCase.execute(day);

    expect(written().isAnomalous).toBe(false);
    expect(events.publish.mock.calls.map(([event]) => event.name)).not.toContain(
      'PriceAnomalyDetected',
    );
  });

  it('pages through targets until they run out', async () => {
    const page = Array.from({ length: 200 }, (_, index) => ({
      productId: `product-${index}`,
      storeId: 'store-1',
      currency: 'ARS',
    }));
    observations.listAggregationTargets
      .mockReset()
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce([
        { productId: 'last', storeId: 'store-1', currency: 'ARS' },
      ])
      .mockResolvedValue([]);

    const summary = await useCase.execute(day);

    expect(summary.targets).toBe(201);
    expect(observations.listAggregationTargets.mock.calls[1][0].skip).toBe(200);
  });
});
