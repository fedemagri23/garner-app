import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  dailyRunKey,
  isImportDue,
} from '../domain/external-price-source.entity.js';
import {
  EXTERNAL_PRICE_SOURCE_REPOSITORY,
  IMPORT_RUN_REPOSITORY,
  type ExternalPriceSourceRepository,
  type ImportRunRepository,
} from '../domain/external-price-source.repository.port.js';
import {
  IMPORT_JOBS,
  type ImportJobs,
} from '../domain/import-jobs.port.js';

/**
 * Decides which sources are due and queues one job each.
 *
 * One job per source is the isolation the plan asks for: a supermarket that
 * times out, returns nonsense or is misconfigured fails its own job, and every
 * other source imports regardless.
 *
 * Runs every few minutes rather than exactly at the scheduled hour, so a
 * deployment or a brief outage over that minute delays a day's import instead
 * of skipping it.
 */
@Injectable()
export class ScheduleSourceImportsUseCase {
  private readonly logger = new Logger(ScheduleSourceImportsUseCase.name);

  constructor(
    @Inject(EXTERNAL_PRICE_SOURCE_REPOSITORY)
    private readonly sources: ExternalPriceSourceRepository,
    @Inject(IMPORT_RUN_REPOSITORY) private readonly runs: ImportRunRepository,
    @Inject(IMPORT_JOBS) private readonly jobs: ImportJobs,
  ) {}

  async execute(now: Date = new Date()): Promise<number> {
    const sources = await this.sources.findEnabled();
    const runKey = dailyRunKey(now);
    let queued = 0;

    for (const source of sources) {
      const lastRunKey = await this.runs.findLastRunKey(source.id);

      if (!isImportDue(source, lastRunKey, now)) {
        continue;
      }

      await this.jobs.enqueueImport(source.id, runKey);
      queued += 1;
    }

    if (queued > 0) {
      this.logger.log(`Queued ${queued} source import(s) for ${runKey}`);
    }

    return queued;
  }
}
