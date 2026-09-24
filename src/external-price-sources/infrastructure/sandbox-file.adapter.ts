import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { z } from 'zod';
import { AppConfigService } from '../../common/config/app-config.service.js';
import {
  AdapterError,
  type AdapterContext,
  type ExternalPrice,
  type ExternalProduct,
  type PriceSourceAdapter,
} from '../domain/price-source-adapter.port.js';

const configSchema = z.object({
  productsFile: z.string().min(1),
  pricesFile: z.string().min(1),
});

const productSchema = z.object({
  externalId: z.string().min(1),
  name: z.string().min(1),
  barcode: z.string().optional(),
  brand: z.string().optional(),
  packageSize: z.number().optional(),
  unit: z.string().optional(),
  imageUrl: z.string().optional(),
});

const priceSchema = z.object({
  externalProductId: z.string().min(1),
  externalStoreId: z.string().min(1),
  priceCents: z.number().int(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  observedAt: z.coerce.date().optional(),
});

/**
 * A source backed by JSON files on disk.
 *
 * It exists so the import pipeline can be developed and tested against a real
 * adapter without a supermarket agreement or a network call — and so a new
 * provider can be prototyped from a captured payload before any code is
 * written for it.
 */
@Injectable()
export class SandboxFileAdapter implements PriceSourceAdapter {
  readonly key = 'sandbox-file';

  constructor(private readonly config: AppConfigService) {}

  async fetchProducts(context: AdapterContext): Promise<ExternalProduct[]> {
    const { productsFile } = this.parseConfig(context);
    return this.read(productsFile, productSchema, 'products');
  }

  async fetchPrices(context: AdapterContext): Promise<ExternalPrice[]> {
    const { pricesFile } = this.parseConfig(context);
    return this.read(pricesFile, priceSchema, 'prices');
  }

  private parseConfig(context: AdapterContext): z.infer<typeof configSchema> {
    const parsed = configSchema.safeParse(context.config);

    if (!parsed.success) {
      throw new AdapterError(
        `Source ${context.sourceSlug} needs productsFile and pricesFile`,
      );
    }

    return parsed.data;
  }

  private async read<T>(
    file: string,
    schema: z.ZodType<T>,
    what: string,
  ): Promise<T[]> {
    const path = this.resolveInsideSandbox(file);

    let raw: string;

    try {
      raw = await readFile(path, 'utf8');
    } catch (error) {
      throw new AdapterError(`Cannot read ${what} file ${file}`, error);
    }

    const parsed = z.array(schema).safeParse(JSON.parse(raw));

    if (!parsed.success) {
      throw new AdapterError(
        `${what} file ${file} is not in the expected shape: ${parsed.error.issues
          .map((issue) => `${issue.path.join('.')} ${issue.message}`)
          .join('; ')}`,
      );
    }

    return parsed.data;
  }

  /**
   * Source configuration is written by administrators, but a path from a
   * database row still gets confined to the sandbox directory: nothing about
   * "read a fixture" should be able to reach /etc.
   */
  private resolveInsideSandbox(file: string): string {
    const root = resolve(this.config.externalSourceSandboxDir);
    const path = resolve(root, file);
    const inside = relative(root, path);

    if (inside.startsWith('..') || resolve(root, inside) !== path) {
      throw new AdapterError(
        `File ${file} is outside the sandbox source directory`,
      );
    }

    return path;
  }
}
