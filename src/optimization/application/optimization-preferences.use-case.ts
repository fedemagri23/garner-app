import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import {
  DEFAULT_PREFERENCES,
  type OptimizationPreferences,
} from '../domain/optimization-request.entity.js';
import {
  OPTIMIZATION_PREFERENCES_REPOSITORY,
  type OptimizationPreferencesRepository,
} from '../domain/optimization.repository.port.js';
import { MAX_STORES_HARD_LIMIT } from '../domain/optimizer.js';

/**
 * The shopper's standing trade-off between money and effort, reused by every
 * optimization until they change it.
 */
@Injectable()
export class OptimizationPreferencesUseCase {
  constructor(
    @Inject(OPTIMIZATION_PREFERENCES_REPOSITORY)
    private readonly preferences: OptimizationPreferencesRepository,
  ) {}

  async get(actor: AuthenticatedUser): Promise<OptimizationPreferences> {
    // Never having chosen is not an error: it is the default trade-off.
    return (
      (await this.preferences.find(actor.id)) ?? {
        userId: actor.id,
        ...DEFAULT_PREFERENCES,
      }
    );
  }

  async update(
    actor: AuthenticatedUser,
    input: Partial<Omit<OptimizationPreferences, 'userId'>>,
  ): Promise<OptimizationPreferences> {
    if (input.maxStores !== undefined && input.maxStores > MAX_STORES_HARD_LIMIT) {
      throw new BadRequestException(
        `maxStores cannot exceed ${MAX_STORES_HARD_LIMIT}`,
      );
    }

    const overlap = (input.preferredSupermarketIds ?? []).filter((id) =>
      (input.excludedSupermarketIds ?? []).includes(id),
    );

    if (overlap.length > 0) {
      throw new BadRequestException(
        'A supermarket cannot be both preferred and excluded',
      );
    }

    return this.preferences.save(actor.id, input);
  }
}
