import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../common/config/app-config.service.js';
import {
  PRICE_OBSERVATION_REPOSITORY,
  type PriceObservationRepository,
} from '../domain/price-observation.repository.port.js';

const BATCH_SIZE = 5_000;
/** Caps one run's work; a backlog larger than this drains over later runs. */
const MAX_BATCHES_PER_RUN = 20;

/**
 * Enforces the retention policy on raw observations.
 *
 * Raw observations are operational data kept for fraud detection, recalculation
 * and debugging — not the price history, which phase 5 keeps as daily
 * aggregates. Once past the window they are deleted.
 */
@Injectable()
export class PrunePriceObservationsUseCase {
  private readonly logger = new Logger(PrunePriceObservationsUseCase.name);

  constructor(
    @Inject(PRICE_OBSERVATION_REPOSITORY)
    private readonly observations: PriceObservationRepository,
    private readonly config: AppConfigService,
  ) {}

  async execute(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(
      now.getTime() -
        this.config.priceObservationRetentionDays * 24 * 60 * 60 * 1000,
    );

    let deleted = 0;

    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
      const count = await this.observations.deleteReceivedBefore(
        cutoff,
        BATCH_SIZE,
      );
      deleted += count;

      if (count < BATCH_SIZE) {
        break;
      }
    }

    if (deleted > 0) {
      this.logger.log(
        `Pruned ${deleted} price observations received before ${cutoff.toISOString()}`,
      );
    }

    return deleted;
  }
}
