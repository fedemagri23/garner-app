import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  assertOwnership,
  type AuthenticatedUser,
} from '../../security/domain/authenticated-user.js';
import type { Product } from '../../products/domain/product.entity.js';
import {
  PRODUCT_REPOSITORY,
  type ProductRepository,
} from '../../products/domain/product.repository.port.js';
import type { StoreLocation } from '../../supermarkets/domain/supermarket.entity.js';
import {
  STORE_LOCATION_REPOSITORY,
  type StoreLocationRepository,
} from '../../supermarkets/domain/supermarket.repository.port.js';
import type { OptimizationRequest } from '../domain/optimization-request.entity.js';
import {
  OPTIMIZATION_REQUEST_REPOSITORY,
  type OptimizationRequestRepository,
} from '../domain/optimization.repository.port.js';
import type { Plan } from '../domain/plan.js';

export interface OptimizationView {
  request: OptimizationRequest;
  stores: Map<string, StoreLocation>;
  products: Map<string, Product>;
}

/**
 * Loads an optimization and the names its stored plans refer to by id.
 *
 * Names are resolved at read time rather than baked into the result, so a
 * store that is renamed after the fact reads correctly — while the prices and
 * assignments stay exactly as they were computed.
 */
@Injectable()
export class OptimizationViewBuilder {
  constructor(
    @Inject(OPTIMIZATION_REQUEST_REPOSITORY)
    private readonly requests: OptimizationRequestRepository,
    @Inject(STORE_LOCATION_REPOSITORY)
    private readonly stores: StoreLocationRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
  ) {}

  async loadOwned(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<OptimizationView> {
    const request = await this.requests.findById(id);

    if (!request) {
      throw new NotFoundException('Optimization not found');
    }

    assertOwnership(request.ownerId, actor);
    return this.build(request);
  }

  async build(request: OptimizationRequest): Promise<OptimizationView> {
    const plans = [
      request.result?.cheapest,
      request.result?.bestBalance,
      request.result?.simplest,
      ...(request.result?.rejectedCheaperAlternatives ?? []).map(
        (rejected) => rejected.plan,
      ),
    ].filter((plan): plan is Plan => Boolean(plan));

    const storeIds = new Set<string>();
    const productIds = new Set<string>(
      request.result?.unavailableProductIds ?? [],
    );

    for (const plan of plans) {
      for (const store of plan.stores) {
        storeIds.add(store.storeId);

        for (const assignment of store.assignments) {
          productIds.add(assignment.productId);
        }
      }

      for (const productId of plan.missingProductIds) {
        productIds.add(productId);
      }
    }

    const [stores, products] = await Promise.all([
      this.stores.findManyByIds([...storeIds]),
      this.products.findManyByIds([...productIds]),
    ]);

    return {
      request,
      stores: new Map(stores.map((store) => [store.id, store])),
      products: new Map(products.map((product) => [product.id, product])),
    };
  }

  async listMine(
    actor: AuthenticatedUser,
    filter: { listId?: string; skip: number; take: number },
  ): Promise<{ requests: OptimizationRequest[]; totalItems: number }> {
    return this.requests.findByOwner(actor.id, filter);
  }
}
