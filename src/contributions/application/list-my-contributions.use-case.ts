import { Inject, Injectable } from '@nestjs/common';
import type { PriceObservation } from '../../pricing/domain/price-observation.entity.js';
import {
  PRICE_OBSERVATION_REPOSITORY,
  type PriceObservationRepository,
} from '../../pricing/domain/price-observation.repository.port.js';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';

/** A contributor's own prices, newest first — shelf reports and purchases alike. */
@Injectable()
export class ListMyContributionsUseCase {
  constructor(
    @Inject(PRICE_OBSERVATION_REPOSITORY)
    private readonly observations: PriceObservationRepository,
  ) {}

  execute(
    actor: AuthenticatedUser,
    page: { skip: number; take: number },
  ): Promise<{ observations: PriceObservation[]; totalItems: number }> {
    return this.observations.findByUser(actor.id, page);
  }
}
