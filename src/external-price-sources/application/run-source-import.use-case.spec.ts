import { NotFoundException } from '@nestjs/common';
import type { EventBus } from '../../common/events/event-bus.js';
import type { IngestPriceObservationService } from '../../pricing/application/ingest-price-observation.service.js';
import type { Product } from '../../products/domain/product.entity.js';
import type { ProductRepository } from '../../products/domain/product.repository.port.js';
import type {
  ExternalPriceSource,
  ExternalProductLink,
  ImportRun,
} from '../domain/external-price-source.entity.js';
import type {
  ExternalPriceSourceRepository,
  ExternalProductLinkRepository,
  ExternalStoreLinkRepository,
  ImportRunRepository,
} from '../domain/external-price-source.repository.port.js';
import {
  AdapterError,
  type AdapterRegistry,
  type PriceSourceAdapter,
} from '../domain/price-source-adapter.port.js';
import { RunSourceImportUseCase } from './run-source-import.use-case.js';

const source: ExternalPriceSource = {
  id: 'source-1',
  name: 'Coto API',
  slug: 'coto-api',
  supermarketId: 'chain-1',
  adapterKey: 'json-http',
  isEnabled: true,
  scheduleHourUtc: 8,
  config: {},
  lastRunAt: null,
  lastSuccessfulRunAt: null,
  lastStatus: null,
  consecutiveFailures: 0,
};

const run: ImportRun = {
  id: 'run-1',
  sourceId: 'source-1',
  runKey: '2026-09-24',
  status: 'STARTED',
  startedAt: new Date(),
  finishedAt: null,
  productsSeen: 0,
  pricesSeen: 0,
  observationsCreated: 0,
  matchedProducts: 0,
  unmatchedProducts: 0,
  skippedPrices: 0,
  error: null,
};

const product = (id: string): Product =>
  ({
    id,
    name: 'Leche Entera 1L',
    normalizedName: 'leche entera 1l',
    packageSize: 1,
    unit: 'LITER',
    isActive: true,
    barcodes: [],
    brand: null,
    category: { id: 'c', name: 'Lácteos', slug: 'lacteos', parentId: null },
    description: null,
    imageUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as Product;

describe('RunSourceImportUseCase', () => {
  let sources: jest.Mocked<Pick<ExternalPriceSourceRepository, 'findById' | 'recordRunOutcome'>>;
  let runs: jest.Mocked<Pick<ImportRunRepository, 'startOrResume' | 'finish'>>;
  let links: jest.Mocked<Pick<ExternalProductLinkRepository, 'findBySource' | 'save'>>;
  let storeLinks: jest.Mocked<Pick<ExternalStoreLinkRepository, 'mapForSource'>>;
  let adapter: jest.Mocked<PriceSourceAdapter>;
  let registry: jest.Mocked<AdapterRegistry>;
  let products: { findByBarcode: jest.Mock; findByNormalizedName: jest.Mock };
  let ingestion: { ingest: jest.Mock };
  let events: { publish: jest.Mock };
  let useCase: RunSourceImportUseCase;

  beforeEach(() => {
    sources = {
      findById: jest.fn().mockResolvedValue(source),
      recordRunOutcome: jest.fn(),
    };
    runs = {
      startOrResume: jest.fn().mockResolvedValue({ run, created: true }),
      finish: jest
        .fn()
        .mockImplementation(async (_id, outcome) => ({
          ...run,
          ...outcome.totals,
          status: outcome.status,
          error: outcome.error,
          finishedAt: new Date(),
        })),
    };
    links = {
      findBySource: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation(async (link) => link as ExternalProductLink),
    };
    storeLinks = {
      mapForSource: jest.fn().mockResolvedValue(new Map([['branch-7', 'store-1']])),
    };
    adapter = {
      key: 'json-http',
      fetchProducts: jest.fn().mockResolvedValue([]),
      fetchPrices: jest.fn().mockResolvedValue([]),
    };
    registry = { get: jest.fn().mockReturnValue(adapter), keys: jest.fn() };
    products = {
      findByBarcode: jest.fn().mockResolvedValue(null),
      findByNormalizedName: jest.fn().mockResolvedValue([]),
    };
    ingestion = { ingest: jest.fn().mockResolvedValue({ created: true }) };
    events = { publish: jest.fn() };

    useCase = new RunSourceImportUseCase(
      sources as unknown as ExternalPriceSourceRepository,
      runs as unknown as ImportRunRepository,
      links as unknown as ExternalProductLinkRepository,
      storeLinks as unknown as ExternalStoreLinkRepository,
      registry,
      products as unknown as ProductRepository,
      ingestion as unknown as IngestPriceObservationService,
      events as unknown as EventBus,
    );
  });

  const externalProduct = {
    externalId: 'SKU-1',
    name: 'Leche Entera 1L',
    packageSize: 1,
    unit: 'L',
  };

  const externalPrice = {
    externalProductId: 'SKU-1',
    externalStoreId: 'branch-7',
    priceCents: 450,
    currency: 'ARS',
  };

  it('turns matched external prices into EXTERNAL_API observations', async () => {
    adapter.fetchProducts.mockResolvedValue([externalProduct]);
    adapter.fetchPrices.mockResolvedValue([externalPrice]);
    products.findByNormalizedName.mockResolvedValue([product('product-1')]);

    const { status } = await useCase.execute('source-1', '2026-09-24');

    expect(status).toBe('COMPLETED');
    expect(ingestion.ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'product-1',
        storeId: 'store-1',
        priceCents: 450,
        currency: 'ARS',
        sourceType: 'EXTERNAL_API',
        userId: null,
        dedupeKey: 'external:source-1:2026-09-24:SKU-1:branch-7',
      }),
    );
  });

  it('records what the source calls each product, matched or not', async () => {
    adapter.fetchProducts.mockResolvedValue([externalProduct]);

    await useCase.execute('source-1', '2026-09-24');

    expect(links.save).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'source-1',
        externalProductId: 'SKU-1',
        externalName: 'Leche Entera 1L',
        productId: null,
        status: 'UNMATCHED',
      }),
    );
  });

  it('never creates a canonical product for something it cannot match', async () => {
    adapter.fetchProducts.mockResolvedValue([externalProduct]);
    adapter.fetchPrices.mockResolvedValue([externalPrice]);

    const { status } = await useCase.execute('source-1', '2026-09-24');

    expect(status).toBe('PARTIAL');
    expect(ingestion.ingest).not.toHaveBeenCalled();
    expect(runs.finish.mock.calls[0][1].totals).toMatchObject({
      unmatchedProducts: 1,
      skippedPrices: 1,
      observationsCreated: 0,
    });
  });

  it('leaves a product a person chose to ignore alone', async () => {
    links.findBySource.mockResolvedValue([
      {
        externalProductId: 'SKU-1',
        status: 'IGNORED',
        productId: null,
      } as ExternalProductLink,
    ]);
    adapter.fetchProducts.mockResolvedValue([externalProduct]);
    adapter.fetchPrices.mockResolvedValue([externalPrice]);

    await useCase.execute('source-1', '2026-09-24');

    expect(links.save).not.toHaveBeenCalled();
    expect(ingestion.ingest).not.toHaveBeenCalled();
  });

  it('honours a manual match from an earlier decision', async () => {
    links.findBySource.mockResolvedValue([
      {
        externalProductId: 'SKU-1',
        status: 'MATCHED',
        productId: 'chosen-by-a-person',
      } as ExternalProductLink,
    ]);
    adapter.fetchProducts.mockResolvedValue([externalProduct]);
    adapter.fetchPrices.mockResolvedValue([externalPrice]);

    await useCase.execute('source-1', '2026-09-24');

    expect(ingestion.ingest).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'chosen-by-a-person' }),
    );
  });

  it('skips a price for a branch nobody has mapped to a store', async () => {
    storeLinks.mapForSource.mockResolvedValue(new Map());
    adapter.fetchProducts.mockResolvedValue([externalProduct]);
    adapter.fetchPrices.mockResolvedValue([externalPrice]);
    products.findByNormalizedName.mockResolvedValue([product('product-1')]);

    const { status } = await useCase.execute('source-1', '2026-09-24');

    expect(status).toBe('PARTIAL');
    expect(ingestion.ingest).not.toHaveBeenCalled();
  });

  it('skips a price the pipeline refuses and keeps importing the rest', async () => {
    adapter.fetchProducts.mockResolvedValue([externalProduct]);
    adapter.fetchPrices.mockResolvedValue([
      externalPrice,
      { ...externalPrice, priceCents: 500 },
    ]);
    products.findByNormalizedName.mockResolvedValue([product('product-1')]);
    ingestion.ingest
      .mockRejectedValueOnce(new NotFoundException('Store not found'))
      .mockResolvedValueOnce({ created: true });

    const { status } = await useCase.execute('source-1', '2026-09-24');

    expect(status).toBe('PARTIAL');
    expect(runs.finish.mock.calls[0][1].totals).toMatchObject({
      observationsCreated: 1,
      skippedPrices: 1,
    });
  });

  describe('failure isolation', () => {
    it('records a failed run when the source cannot be reached', async () => {
      adapter.fetchProducts.mockRejectedValue(new AdapterError('connect ETIMEDOUT'));

      const { status } = await useCase.execute('source-1', '2026-09-24');

      expect(status).toBe('FAILED');
      expect(runs.finish.mock.calls[0][1].error).toContain('ETIMEDOUT');
      expect(sources.recordRunOutcome).toHaveBeenCalledWith(
        'source-1',
        expect.objectContaining({ status: 'FAILED' }),
      );
    });

    it('fails only this source when its adapter is unknown', async () => {
      registry.get.mockReturnValue(null);

      const { status } = await useCase.execute('source-1', '2026-09-24');

      expect(status).toBe('FAILED');
      expect(runs.finish.mock.calls[0][1].error).toContain('unknown adapter');
    });

    it('always announces the run finishing, however it went', async () => {
      adapter.fetchProducts.mockRejectedValue(new AdapterError('boom'));

      await useCase.execute('source-1', '2026-09-24');

      const names = events.publish.mock.calls.map(([event]) => event.name);
      expect(names).toEqual([
        'ExternalPriceImportStarted',
        'ExternalPriceImportCompleted',
      ]);
    });
  });

  describe('idempotency', () => {
    it('does nothing when the day’s slot already finished', async () => {
      runs.startOrResume.mockResolvedValue({
        run: { ...run, status: 'COMPLETED' },
        created: false,
      });

      const { status } = await useCase.execute('source-1', '2026-09-24');

      expect(status).toBe('COMPLETED');
      expect(adapter.fetchProducts).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('resumes a run left started by a crash', async () => {
      runs.startOrResume.mockResolvedValue({ run, created: false });
      adapter.fetchProducts.mockResolvedValue([externalProduct]);

      await useCase.execute('source-1', '2026-09-24');

      expect(adapter.fetchProducts).toHaveBeenCalled();
    });

    it('keys every observation to its run, so a retry rewrites nothing', async () => {
      adapter.fetchProducts.mockResolvedValue([externalProduct]);
      adapter.fetchPrices.mockResolvedValue([externalPrice]);
      products.findByNormalizedName.mockResolvedValue([product('product-1')]);

      await useCase.execute('source-1', '2026-09-24');
      await useCase.execute('source-1', '2026-09-24');

      const keys = ingestion.ingest.mock.calls.map(([command]) => command.dedupeKey);
      expect(new Set(keys).size).toBe(1);
    });
  });
});
