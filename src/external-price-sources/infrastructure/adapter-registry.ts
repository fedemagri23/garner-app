import { Injectable } from '@nestjs/common';
import type {
  AdapterRegistry,
  PriceSourceAdapter,
} from '../domain/price-source-adapter.port.js';
import { JsonHttpAdapter } from './json-http.adapter.js';
import { SandboxFileAdapter } from './sandbox-file.adapter.js';

/**
 * Every integration the deployment knows, by key.
 *
 * Adding a supermarket means writing an adapter and listing it here; nothing
 * in the import pipeline changes. A source naming an unknown adapter fails
 * that source's run and leaves the others alone.
 */
@Injectable()
export class InMemoryAdapterRegistry implements AdapterRegistry {
  private readonly adapters = new Map<string, PriceSourceAdapter>();

  constructor(jsonHttp: JsonHttpAdapter, sandboxFile: SandboxFileAdapter) {
    for (const adapter of [jsonHttp, sandboxFile]) {
      this.adapters.set(adapter.key, adapter);
    }
  }

  get(key: string): PriceSourceAdapter | null {
    return this.adapters.get(key) ?? null;
  }

  keys(): string[] {
    return [...this.adapters.keys()].sort();
  }
}
