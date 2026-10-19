import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { EventBus } from '../../common/events/event-bus.js';
import type { Product } from '../../products/domain/product.entity.js';
import type { ProductRepository } from '../../products/domain/product.repository.port.js';
import type { StoreLocation } from '../../supermarkets/domain/supermarket.entity.js';
import type { StoreLocationRepository } from '../../supermarkets/domain/supermarket.repository.port.js';
import type { User } from '../../users/domain/user.entity.js';
import type { UserRepository } from '../../users/domain/user.repository.port.js';
import type {
  NewPriceObservation,
  PriceObservation,
} from '../domain/price-observation.entity.js';
import type {
  PriceObservationRepository,
  SubmissionCounter,
} from '../domain/price-observation.repository.port.js';
import { HARD_LIMITS } from '../domain/submission-policy.js';
import {
  IngestPriceObservationService,
  type IngestPriceObservationCommand,
} from './ingest-price-observation.service.js';

const DAY = 24 * 60 * 60 * 1000;

const stored = (input: NewPriceObservation): PriceObservation => ({
  ...input,
  id: input.id ?? 'obs-1',
  receivedAt: new Date(),
  lastConfirmedAt: null,
});

describe('IngestPriceObservationService', () => {
  let observations: jest.Mocked<PriceObservationRepository>;
  let counter: jest.Mocked<SubmissionCounter>;
  let products: { findById: jest.Mock };
  let stores: { findById: jest.Mock };
  let users: { findById: jest.Mock };
  let events: { publish: jest.Mock };
  let service: IngestPriceObservationService;

  const report = (
    overrides: Partial<IngestPriceObservationCommand> = {},
  ): IngestPriceObservationCommand => ({
    productId: 'product-1',
    storeId: 'store-1',
    priceCents: 125,
    currency: 'ARS',
    observedAt: new Date(),
    sourceType: 'USER_REPORTED',
    userId: 'user-1',
    clientIp: '203.0.113.7',
    ...overrides,
  });

  beforeEach(() => {
    observations = {
      findById: jest.fn().mockResolvedValue(null),
      findByDedupeKey: jest.fn().mockResolvedValue(null),
      findRecentDuplicate: jest.fn().mockResolvedValue(null),
      recentAcceptedPrices: jest.fn().mockResolvedValue([]),
      countByUserWithReasonSince: jest.fn().mockResolvedValue(0),
      findByUser: jest.fn(),
      findLatestByDedupePrefix: jest.fn().mockResolvedValue(null),
      confirm: jest.fn(),
      findInWindow: jest.fn(),
      listAggregationTargets: jest.fn(),
      create: jest
        .fn()
        .mockImplementation(async (input: NewPriceObservation) => ({
          observation: stored(input),
          created: true,
        })),
      deleteReceivedBefore: jest.fn(),
    };
    counter = {
      hit: jest.fn().mockImplementation(async (keys: unknown[]) => keys.map(() => 1)),
    };
    products = {
      findById: jest.fn().mockResolvedValue({ id: 'product-1', isActive: true } as Product),
    };
    stores = {
      findById: jest.fn().mockResolvedValue({ id: 'store-1', isActive: true } as StoreLocation),
    };
    users = {
      findById: jest
        .fn()
        .mockResolvedValue({ id: 'user-1', createdAt: new Date(Date.now() - 30 * DAY) } as User),
    };
    events = { publish: jest.fn() };

    service = new IngestPriceObservationService(
      observations,
      counter,
      products as unknown as ProductRepository,
      stores as unknown as StoreLocationRepository,
      users as unknown as UserRepository,
      events as unknown as EventBus,
    );
  });

  const publishedNames = () =>
    events.publish.mock.calls.map(([event]) => (event as { name: string }).name);

  describe('input that cannot be a price', () => {
    it('is refused and nothing is stored or counted', async () => {
      await expect(service.ingest(report({ priceCents: 0 }))).rejects.toThrow(
        BadRequestException,
      );

      expect(observations.create).not.toHaveBeenCalled();
      expect(counter.hit).not.toHaveBeenCalled();
    });

    it('refuses an unknown product or store', async () => {
      products.findById.mockResolvedValue(null);
      await expect(service.ingest(report())).rejects.toThrow(NotFoundException);

      products.findById.mockResolvedValue({ id: 'product-1', isActive: true });
      stores.findById.mockResolvedValue(null);
      await expect(service.ingest(report())).rejects.toThrow(NotFoundException);
    });

    it('refuses a report for a retired product', async () => {
      products.findById.mockResolvedValue({ id: 'product-1', isActive: false });

      await expect(service.ingest(report())).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('still records a purchase of a product retired since', async () => {
      products.findById.mockResolvedValue({ id: 'product-1', isActive: false });

      await expect(
        service.ingest(
          report({ sourceType: 'PURCHASE_CONFIRMED', dedupeKey: 'purchase:line-1', clientIp: null }),
        ),
      ).resolves.toMatchObject({ created: true });
    });
  });

  describe('retries and duplicates', () => {
    it('returns the stored report when the client retries with its id', async () => {
      const existing = stored({ ...report(), id: 'client-id', status: 'ACCEPTED', reviewReasons: [], shoppingSessionId: null, dedupeKey: null, evidencePhotoKey: null, evidenceNote: null, userId: 'user-1' });
      observations.findById.mockResolvedValue(existing);

      await expect(service.ingest(report({ id: 'client-id' }))).resolves.toEqual({
        observation: existing,
        created: false,
      });
      expect(counter.hit).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('refuses an id that already names another user’s report', async () => {
      observations.findById.mockResolvedValue(
        stored({ ...report(), id: 'client-id', userId: 'someone-else', status: 'ACCEPTED', reviewReasons: [], shoppingSessionId: null, dedupeKey: null, evidencePhotoKey: null, evidenceNote: null }),
      );

      await expect(service.ingest(report({ id: 'client-id' }))).rejects.toThrow(
        ConflictException,
      );
    });

    it('returns the existing observation for a known dedupe key', async () => {
      const existing = { id: 'obs-9' } as PriceObservation;
      observations.findByDedupeKey.mockResolvedValue(existing);

      const result = await service.ingest(
        report({ sourceType: 'PURCHASE_CONFIRMED', dedupeKey: 'purchase:line-1' }),
      );

      expect(result).toEqual({ observation: existing, created: false });
      expect(observations.create).not.toHaveBeenCalled();
    });

    it('treats the same report sent twice in a short window as one, without counting it again', async () => {
      const existing = { id: 'obs-earlier' } as PriceObservation;
      observations.findRecentDuplicate.mockResolvedValue(existing);

      const result = await service.ingest(report());

      expect(result).toEqual({ observation: existing, created: false });
      expect(counter.hit).not.toHaveBeenCalled();
    });

    it('does not publish anything when a create loses a race to its own retry', async () => {
      observations.create.mockResolvedValue({
        observation: { id: 'obs-1', userId: 'user-1' } as PriceObservation,
        created: false,
      });

      await service.ingest(report());

      expect(events.publish).not.toHaveBeenCalled();
    });
  });

  describe('rate limits', () => {
    it('refuses with 429 past the per-account-target limit and stores nothing', async () => {
      counter.hit.mockResolvedValue([1, HARD_LIMITS.perAccountTarget.max + 1, 1, 1, 1]);

      const attempt = service.ingest(report());

      await expect(attempt).rejects.toThrow(HttpException);
      await expect(service.ingest(report())).rejects.toMatchObject({ status: 429 });
      expect(observations.create).not.toHaveBeenCalled();
    });

    it('refuses past the per-IP limit', async () => {
      counter.hit.mockResolvedValue([1, 1, 1, 1, HARD_LIMITS.perIp.max + 1]);

      await expect(service.ingest(report())).rejects.toMatchObject({ status: 429 });
    });

    it('counts a report against account, target, product, store and IP', async () => {
      await service.ingest(report());

      const keys = counter.hit.mock.calls[0][0].map((entry: { key: string }) => entry.key);
      expect(keys).toEqual([
        'price-submissions:account:user-1',
        'price-submissions:account-target:user-1:product-1:store-1',
        'price-submissions:product:product-1',
        'price-submissions:store:store-1',
        'price-submissions:ip:203.0.113.7',
      ]);
    });

    it('does not count purchases, which are bounded by their trip', async () => {
      await service.ingest(
        report({ sourceType: 'PURCHASE_CONFIRMED', dedupeKey: 'purchase:line-1', clientIp: null }),
      );

      expect(counter.hit).not.toHaveBeenCalled();
    });
  });

  describe('trust and events', () => {
    it('accepts an ordinary report and announces it as created and accepted', async () => {
      const { observation } = await service.ingest(report());

      expect(observation.status).toBe('ACCEPTED');
      expect(publishedNames()).toEqual([
        'PriceObservationCreated',
        'PriceObservationAccepted',
      ]);
    });

    it('stores a new account’s report as flagged, announcing only its creation', async () => {
      users.findById.mockResolvedValue({ id: 'user-1', createdAt: new Date() });

      const { observation } = await service.ingest(report());

      expect(observation).toMatchObject({
        status: 'FLAGGED',
        reviewReasons: ['NEW_ACCOUNT'],
      });
      expect(publishedNames()).toEqual(['PriceObservationCreated']);
    });

    it('stores an extreme report as rejected and announces the rejection', async () => {
      observations.recentAcceptedPrices.mockResolvedValue([120, 125, 130]);

      const { observation } = await service.ingest(report({ priceCents: 1250 }));

      expect(observation.status).toBe('REJECTED');
      expect(publishedNames()).toEqual([
        'PriceObservationCreated',
        'PriceObservationRejected',
      ]);
    });

    it('never puts review reasons in an event', async () => {
      users.findById.mockResolvedValue({ id: 'user-1', createdAt: new Date() });

      await service.ingest(report());

      expect(JSON.stringify(events.publish.mock.calls)).not.toContain('NEW_ACCOUNT');
    });

    it('samples only same-currency prices for the deviation check', async () => {
      await service.ingest(report({ currency: 'EUR' }));

      for (const [query] of observations.recentAcceptedPrices.mock.calls) {
        expect(query.currency).toBe('EUR');
      }
    });
  });

  describe('confirming an unchanged feed price', () => {
    const feed = (overrides: Partial<IngestPriceObservationCommand> = {}) =>
      report({
        sourceType: 'EXTERNAL_API',
        userId: null,
        clientIp: null,
        dedupeKey: 'external:source-1:2026-10-19:p1:s1',
        confirmUnchangedFrom: 'external:source-1:',
        ...overrides,
      });

    const previous = (overrides: Partial<PriceObservation> = {}): PriceObservation => ({
      ...stored({
        ...feed(),
        observedAt: new Date(Date.now() - DAY),
        status: 'ACCEPTED',
        reviewReasons: [],
        shoppingSessionId: null,
        dedupeKey: 'external:source-1:2026-10-18:p1:s1',
        evidencePhotoKey: null,
        evidenceNote: null,
      }),
      id: 'previous',
      ...overrides,
    });

    it('moves the previous observation forward instead of writing a row', async () => {
      const command = feed();
      observations.findLatestByDedupePrefix.mockResolvedValue(previous());
      observations.confirm.mockResolvedValue(
        previous({ lastConfirmedAt: command.observedAt }),
      );

      const result = await service.ingest(command);

      expect(result).toMatchObject({ created: false, confirmed: true });
      expect(observations.confirm).toHaveBeenCalledWith('previous', command.observedAt);
      expect(observations.create).not.toHaveBeenCalled();
      expect(publishedNames()).toEqual(['PriceObservationConfirmed']);
    });

    it('looks only at what the same source said before', async () => {
      await service.ingest(feed());

      expect(observations.findLatestByDedupePrefix).toHaveBeenCalledWith({
        productId: 'product-1',
        storeId: 'store-1',
        dedupeKeyPrefix: 'external:source-1:',
      });
    });

    it.each([
      ['the price moved', { priceCents: 126 }],
      ['the currency differs', { currency: 'EUR' }],
      ['the previous one is still in doubt', { status: 'FLAGGED' as const }],
    ])('writes a new observation when %s', async (_case, overrides) => {
      observations.findLatestByDedupePrefix.mockResolvedValue(previous(overrides));

      const result = await service.ingest(feed());

      expect(result.created).toBe(true);
      expect(observations.confirm).not.toHaveBeenCalled();
    });

    it('does not confirm with a sighting older than the observation', async () => {
      observations.findLatestByDedupePrefix.mockResolvedValue(
        previous({ observedAt: new Date(Date.now() + 60_000) }),
      );

      const result = await service.ingest(feed());

      expect(result.created).toBe(true);
    });

    it('writes a fresh row if the previous one vanished before it was confirmed', async () => {
      observations.findLatestByDedupePrefix.mockResolvedValue(previous());
      observations.confirm.mockResolvedValue(null);

      const result = await service.ingest(feed());

      expect(result.created).toBe(true);
    });

    it('is never attempted for a source that did not ask for it', async () => {
      await service.ingest(report());

      expect(observations.findLatestByDedupePrefix).not.toHaveBeenCalled();
    });
  });
});
