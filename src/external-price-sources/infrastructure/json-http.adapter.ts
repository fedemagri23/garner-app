import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { AppConfigService } from '../../common/config/app-config.service.js';
import {
  AdapterError,
  type AdapterContext,
  type ExternalPrice,
  type ExternalProduct,
  type PriceSourceAdapter,
} from '../domain/price-source-adapter.port.js';

/**
 * Configuration of a JSON-over-HTTP source.
 *
 * Field names are configurable because every supermarket names things
 * differently; anything beyond renaming — a different pagination scheme, a
 * signed request, XML — is a new adapter. That is the line this contract draws.
 */
/** What the fields are called when a source does not say otherwise. */
const PRODUCT_FIELDS = {
  id: 'id',
  name: 'name',
  barcode: 'barcode',
  brand: 'brand',
  packageSize: 'packageSize',
  unit: 'unit',
  imageUrl: 'imageUrl',
} as const;

const PRICE_FIELDS = {
  productId: 'productId',
  storeId: 'storeId',
  price: 'price',
  currency: 'currency',
  observedAt: 'observedAt',
} as const;

const configSchema = z.object({
  productsUrl: z.url(),
  pricesUrl: z.url(),
  /** Key holding the array in each response; empty means the body is the array. */
  itemsKey: z.string().default('items'),
  /** Key holding the next page number, if the source paginates that way. */
  nextPageKey: z.string().default('nextPage'),
  pageParam: z.string().default('page'),
  firstPage: z.coerce.number().int().default(1),
  /** Caps one import's work however much the source offers. */
  maxPages: z.coerce.number().int().min(1).max(500).default(50),
  timeoutMs: z.coerce.number().int().min(1_000).max(120_000).default(15_000),
  /** Default when an item carries no currency of its own. */
  currency: z.string().regex(/^[A-Z]{3}$/).default('ARS'),
  /** Set when the source quotes 1.25 rather than 125. */
  priceInMajorUnits: z.boolean().default(false),
  productFields: z
    .object({
      id: z.string().default(PRODUCT_FIELDS.id),
      name: z.string().default(PRODUCT_FIELDS.name),
      barcode: z.string().default(PRODUCT_FIELDS.barcode),
      brand: z.string().default(PRODUCT_FIELDS.brand),
      packageSize: z.string().default(PRODUCT_FIELDS.packageSize),
      unit: z.string().default(PRODUCT_FIELDS.unit),
      imageUrl: z.string().default(PRODUCT_FIELDS.imageUrl),
    })
    .default(PRODUCT_FIELDS),
  priceFields: z
    .object({
      productId: z.string().default(PRICE_FIELDS.productId),
      storeId: z.string().default(PRICE_FIELDS.storeId),
      price: z.string().default(PRICE_FIELDS.price),
      currency: z.string().default(PRICE_FIELDS.currency),
      observedAt: z.string().default(PRICE_FIELDS.observedAt),
    })
    .default(PRICE_FIELDS),
});

export type JsonHttpConfig = z.infer<typeof configSchema>;

/**
 * A source that publishes JSON over HTTP — the shape most supermarket feeds
 * and scraping proxies end up in.
 *
 * Everything HTTP stays here: authentication, paging, timeouts, and the fact
 * that a feed's "price" may be a string, a float, or in pesos rather than
 * centavos. What leaves is plain ExternalProduct and ExternalPrice.
 */
@Injectable()
export class JsonHttpAdapter implements PriceSourceAdapter {
  readonly key = 'json-http';

  private readonly logger = new Logger(JsonHttpAdapter.name);

  constructor(private readonly config: AppConfigService) {}

  async fetchProducts(context: AdapterContext): Promise<ExternalProduct[]> {
    const config = this.parseConfig(context);
    const fields = config.productFields;

    const items = await this.fetchAllPages(
      config.productsUrl,
      config,
      context,
    );

    return items.flatMap((item) => {
      const externalId = readString(item, fields.id);
      const name = readString(item, fields.name);

      // A product without an identity or a name cannot be matched or shown.
      if (!externalId || !name) {
        return [];
      }

      return [
        {
          externalId,
          name,
          barcode: readString(item, fields.barcode) ?? undefined,
          brand: readString(item, fields.brand) ?? undefined,
          packageSize: readNumber(item, fields.packageSize) ?? undefined,
          unit: readString(item, fields.unit) ?? undefined,
          imageUrl: readString(item, fields.imageUrl) ?? undefined,
        },
      ];
    });
  }

  async fetchPrices(context: AdapterContext): Promise<ExternalPrice[]> {
    const config = this.parseConfig(context);
    const fields = config.priceFields;

    const items = await this.fetchAllPages(config.pricesUrl, config, context);

    return items.flatMap((item) => {
      const externalProductId = readString(item, fields.productId);
      const externalStoreId = readString(item, fields.storeId);
      const rawPrice = readNumber(item, fields.price);

      if (!externalProductId || !externalStoreId || rawPrice === null) {
        return [];
      }

      const priceCents = config.priceInMajorUnits
        ? Math.round(rawPrice * 100)
        : Math.round(rawPrice);

      const observedAt = readString(item, fields.observedAt);
      const parsedObservedAt = observedAt ? new Date(observedAt) : undefined;

      return [
        {
          externalProductId,
          externalStoreId,
          priceCents,
          currency: readString(item, fields.currency) ?? config.currency,
          observedAt:
            parsedObservedAt && !Number.isNaN(parsedObservedAt.getTime())
              ? parsedObservedAt
              : undefined,
        },
      ];
    });
  }

  private parseConfig(context: AdapterContext): JsonHttpConfig {
    const parsed = configSchema.safeParse(context.config);

    if (!parsed.success) {
      throw new AdapterError(
        `Source ${context.sourceSlug} is misconfigured: ${parsed.error.issues
          .map((issue) => `${issue.path.join('.') || '(root)'} ${issue.message}`)
          .join('; ')}`,
      );
    }

    return parsed.data;
  }

  private async fetchAllPages(
    url: string,
    config: JsonHttpConfig,
    context: AdapterContext,
  ): Promise<Record<string, unknown>[]> {
    const collected: Record<string, unknown>[] = [];
    let page: number | null = config.firstPage;

    for (let fetched = 0; fetched < config.maxPages && page !== null; fetched++) {
      const body = await this.fetchPage(url, page, config, context);
      const items = this.readItems(body, config);

      collected.push(...items);

      const next = this.readNextPage(body, config);

      // A source that returns an empty page, or stops advancing, is done.
      page = items.length === 0 || next === page ? null : next;
    }

    return collected;
  }

  private async fetchPage(
    url: string,
    page: number,
    config: JsonHttpConfig,
    context: AdapterContext,
  ): Promise<unknown> {
    const target = new URL(url);
    target.searchParams.set(config.pageParam, String(page));

    const token = this.config.externalSourceToken(context.sourceSlug);
    const headers: Record<string, string> = { accept: 'application/json' };

    if (token) {
      headers.authorization = `Bearer ${token}`;
    }

    // Two reasons to stop waiting: the source is slow, or the whole run was
    // cancelled. Either must end the request rather than hang the import.
    const timeout = AbortSignal.timeout(config.timeoutMs);
    const signal = context.signal
      ? AbortSignal.any([timeout, context.signal])
      : timeout;

    let response: Response;

    try {
      response = await fetch(target, { headers, signal });
    } catch (error) {
      throw new AdapterError(
        `Request to ${redact(target)} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error,
      );
    }

    if (!response.ok) {
      throw new AdapterError(
        `Request to ${redact(target)} returned ${response.status}`,
      );
    }

    try {
      return await response.json();
    } catch (error) {
      throw new AdapterError(`Response from ${redact(target)} is not JSON`, error);
    }
  }

  private readItems(
    body: unknown,
    config: JsonHttpConfig,
  ): Record<string, unknown>[] {
    const candidate =
      config.itemsKey === ''
        ? body
        : isRecord(body)
          ? body[config.itemsKey]
          : undefined;

    if (!Array.isArray(candidate)) {
      this.logger.warn(
        `Expected an array at "${config.itemsKey || '(root)'}"; treating the page as empty`,
      );
      return [];
    }

    return candidate.filter(isRecord);
  }

  private readNextPage(body: unknown, config: JsonHttpConfig): number | null {
    if (!isRecord(body)) {
      return null;
    }

    const next = body[config.nextPageKey];
    return typeof next === 'number' && Number.isFinite(next) ? next : null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(
  item: Record<string, unknown>,
  field: string,
): string | null {
  const value = item[field];

  if (typeof value === 'string') {
    return value.trim() || null;
  }

  return typeof value === 'number' ? String(value) : null;
}

function readNumber(
  item: Record<string, unknown>,
  field: string,
): number | null {
  const value = item[field];

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  // Feeds commonly quote numbers as strings, sometimes with a comma decimal.
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

/** Keeps a token or key in a query string out of logs and error messages. */
function redact(url: URL): string {
  return `${url.origin}${url.pathname}`;
}
