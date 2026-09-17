import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { PrunePriceObservationsUseCase } from '../application/prune-price-observations.use-case.js';

export const PRICING_MAINTENANCE_QUEUE = 'pricing-maintenance';

export const PricingMaintenanceJob = {
  PruneObservations: 'prune-observations',
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Runs pricing's scheduled housekeeping. The prune job is idempotent — running
 * it twice deletes nothing the first run did not — so overlapping schedules or
 * a retried job are harmless.
 */
@Processor(PRICING_MAINTENANCE_QUEUE)
export class PricingMaintenanceProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(PricingMaintenanceProcessor.name);

  constructor(
    private readonly prune: PrunePriceObservationsUseCase,
    @InjectQueue(PRICING_MAINTENANCE_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  /**
   * A job scheduler is upserted by id, so every instance registering it on
   * boot converges on one schedule instead of stacking duplicates.
   */
  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      PricingMaintenanceJob.PruneObservations,
      { every: DAY_MS },
      { name: PricingMaintenanceJob.PruneObservations },
    );
  }

  async process(job: Job): Promise<{ deleted: number }> {
    if (job.name !== PricingMaintenanceJob.PruneObservations) {
      throw new Error(`Unsupported job "${job.name}" on ${PRICING_MAINTENANCE_QUEUE}`);
    }

    const deleted = await this.prune.execute();
    this.logger.debug(`Retention run deleted ${deleted} observations`);
    return { deleted };
  }
}
