import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { slugify } from '../../common/text/normalize.js';
import {
  PRODUCT_REPOSITORY,
  type ProductRepository,
} from '../../products/domain/product.repository.port.js';
import {
  STORE_LOCATION_REPOSITORY,
  SUPERMARKET_REPOSITORY,
  type StoreLocationRepository,
  type SupermarketRepository,
} from '../../supermarkets/domain/supermarket.repository.port.js';
import {
  ExternalProductLinkStatus,
  ProductMatchMethod,
  type ExternalPriceSource,
  type ExternalProductLink,
  type ImportRun,
} from '../domain/external-price-source.entity.js';
import {
  EXTERNAL_PRICE_SOURCE_REPOSITORY,
  EXTERNAL_PRODUCT_LINK_REPOSITORY,
  EXTERNAL_STORE_LINK_REPOSITORY,
  IMPORT_RUN_REPOSITORY,
  type ExternalPriceSourceRepository,
  type ExternalProductLinkRepository,
  type ExternalStoreLinkRepository,
  type ImportRunRepository,
} from '../domain/external-price-source.repository.port.js';
import {
  ADAPTER_REGISTRY,
  type AdapterRegistry,
} from '../domain/price-source-adapter.port.js';

export interface CreatePriceSourceCommand {
  name: string;
  supermarketId: string;
  adapterKey: string;
  scheduleHourUtc?: number;
  config?: Record<string, unknown>;
}

export interface UpdatePriceSourceCommand {
  name?: string;
  isEnabled?: boolean;
  scheduleHourUtc?: number;
  config?: Record<string, unknown>;
}

/**
 * Administration of the source registry, and the manual half of product
 * matching. Both are deliberately people-driven: which supermarket a source
 * speaks for, and what an unrecognized product actually is, are decisions
 * automation should not make on its own.
 */
@Injectable()
export class ManagePriceSourcesUseCase {
  constructor(
    @Inject(EXTERNAL_PRICE_SOURCE_REPOSITORY)
    private readonly sources: ExternalPriceSourceRepository,
    @Inject(IMPORT_RUN_REPOSITORY) private readonly runs: ImportRunRepository,
    @Inject(EXTERNAL_PRODUCT_LINK_REPOSITORY)
    private readonly links: ExternalProductLinkRepository,
    @Inject(EXTERNAL_STORE_LINK_REPOSITORY)
    private readonly storeLinks: ExternalStoreLinkRepository,
    @Inject(ADAPTER_REGISTRY) private readonly adapters: AdapterRegistry,
    @Inject(SUPERMARKET_REPOSITORY)
    private readonly supermarkets: SupermarketRepository,
    @Inject(STORE_LOCATION_REPOSITORY)
    private readonly stores: StoreLocationRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
  ) {}

  list(): Promise<ExternalPriceSource[]> {
    return this.sources.findAll();
  }

  async get(id: string): Promise<ExternalPriceSource> {
    const source = await this.sources.findById(id);

    if (!source) {
      throw new NotFoundException('Price source not found');
    }

    return source;
  }

  async create(command: CreatePriceSourceCommand): Promise<ExternalPriceSource> {
    if (!this.adapters.get(command.adapterKey)) {
      throw new BadRequestException(
        `Unknown adapter "${command.adapterKey}". Available: ${this.adapters.keys().join(', ')}`,
      );
    }

    if (!(await this.supermarkets.findById(command.supermarketId))) {
      throw new NotFoundException('Supermarket not found');
    }

    const slug = slugify(command.name);

    if (await this.sources.findBySlug(slug)) {
      throw new ConflictException('A price source with this name already exists');
    }

    return this.sources.create({
      name: command.name.trim(),
      slug,
      supermarketId: command.supermarketId,
      adapterKey: command.adapterKey,
      scheduleHourUtc: command.scheduleHourUtc ?? 8,
      config: command.config ?? {},
    });
  }

  async update(
    id: string,
    command: UpdatePriceSourceCommand,
  ): Promise<ExternalPriceSource> {
    await this.get(id);
    return this.sources.update(id, command);
  }

  async listRuns(id: string, limit: number): Promise<ImportRun[]> {
    await this.get(id);
    return this.runs.findRecent(id, limit);
  }

  async listLinks(
    id: string,
    status: ExternalProductLinkStatus,
    page: { skip: number; take: number },
  ): Promise<{ links: ExternalProductLink[]; totalItems: number }> {
    await this.get(id);
    return this.links.listByStatus(id, status, page);
  }

  /**
   * A person's decision about an external product: this is our product, or
   * there is nothing here worth matching. Their decision outranks the
   * matcher's and survives later imports.
   */
  async resolveLink(
    sourceId: string,
    externalProductId: string,
    decision: { productId: string } | { ignore: true },
  ): Promise<ExternalProductLink> {
    await this.get(sourceId);

    const link = await this.links.findOne(sourceId, externalProductId);

    if (!link) {
      throw new NotFoundException('This source has not reported that product');
    }

    if ('ignore' in decision) {
      return this.links.save({
        sourceId,
        externalProductId,
        externalName: link.externalName,
        externalBarcode: link.externalBarcode,
        productId: null,
        matchMethod: null,
        status: ExternalProductLinkStatus.Ignored,
        lastSeenAt: link.lastSeenAt,
      });
    }

    if (!(await this.products.findById(decision.productId))) {
      throw new NotFoundException('Product not found');
    }

    return this.links.save({
      sourceId,
      externalProductId,
      externalName: link.externalName,
      externalBarcode: link.externalBarcode,
      productId: decision.productId,
      matchMethod: ProductMatchMethod.Manual,
      status: ExternalProductLinkStatus.Matched,
      lastSeenAt: link.lastSeenAt,
    });
  }

  /**
   * Maps a branch the source names to a store in the catalog. Always manual:
   * a mis-mapped store files real prices against the wrong place, and no
   * string similarity is worth that.
   */
  async linkStore(
    sourceId: string,
    externalStoreId: string,
    storeId: string,
  ): Promise<void> {
    const source = await this.get(sourceId);
    const store = await this.stores.findById(storeId);

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    if (store.supermarketId !== source.supermarketId) {
      throw new BadRequestException(
        'That store belongs to a different supermarket than this source',
      );
    }

    await this.storeLinks.link(sourceId, externalStoreId, storeId);
  }

  async unlinkStore(sourceId: string, externalStoreId: string): Promise<void> {
    await this.get(sourceId);
    await this.storeLinks.unlink(sourceId, externalStoreId);
  }

  async storeLinksFor(sourceId: string): Promise<Map<string, string>> {
    await this.get(sourceId);
    return this.storeLinks.mapForSource(sourceId);
  }

  availableAdapters(): string[] {
    return this.adapters.keys();
  }
}
