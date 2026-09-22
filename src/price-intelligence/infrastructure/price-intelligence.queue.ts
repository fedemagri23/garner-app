import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { AggregateDailyPricesUseCase } from '../application/aggregate-daily-prices.use-case.js';
import { RecomputeDerivedPriceUseCase } from '../application/recompute-derived-price.use-case.js';
import { utcDay } from '../domain/price-history.js';

export const PRICE_INTELLIGENCE_QUEUE = 'price-intelligence';

export const PriceIntelligenceJob = {
  RecomputePrice: 'recompute-price',
  AggregateDay: 'aggregate-day',
} as const;

export interface RecomputePriceData {
  productId: string;
  storeId: string;
}

export interface AggregateDayData {
  /** UTC day as `YYYY-MM-DD`; omitted on the scheduled run, which does yesterday. */
  date?: string;
}

/**
 * Recomputing is deferred by a few seconds so a burst of observations for one
 * product — a shopper finishing a trip, a feed importing a store — collapses
 * into a single recompute rather than one per observation.
 */
const RECOMPUTE_DEBOUNCE_MS = 5_000;

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PriceIntelligenceJobs {
  constructor(
    @InjectQueue(PRICE_INTELLIGENCE_QUEUE) private readonly queue: Queue,
  ) {}

  async enqueueRecompute(productId: string, storeId: string): Promise<void> {
    await this.queue.add(
      PriceIntelligenceJob.RecomputePrice,
      { productId, storeId } satisfies RecomputePriceData,
      {
        jobId: `${PriceIntelligenceJob.RecomputePrice}-${productId}-${storeId}`,
        delay: RECOMPUTE_DEBOUNCE_MS,
        attempts: 5,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: true,
        removeOnFail: { age: 60 * 60 },
      },
    );
  }

  async enqueueAggregation(date: Date): Promise<void> {
    const isoDate = utcDay(date).toISOString().slice(0, 10);

    await this.queue.add(
      PriceIntelligenceJob.AggregateDay,
      { date: isoDate } satisfies AggregateDayData,
      {
        jobId: `${PriceIntelligenceJob.AggregateDay}-${isoDate}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: { age: 24 * 60 * 60 },
      },
    );
  }
}

/**
 * Both jobs are idempotent: a recompute rewrites one row from the observations
 * in the window, and an aggregation rewrites a day's rows from that day's
 * observations. Retries and overlapping runs converge on the same result.
 */
@Processor(PRICE_INTELLIGENCE_QUEUE)
export class PriceIntelligenceProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(PriceIntelligenceProcessor.name);

  constructor(
    private readonly recompute: RecomputeDerivedPriceUseCase,
    private readonly aggregate: AggregateDailyPricesUseCase,
    @InjectQueue(PRICE_INTELLIGENCE_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      PriceIntelligenceJob.AggregateDay,
      { every: DAY_MS },
      { name: PriceIntelligenceJob.AggregateDay },
    );
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case PriceIntelligenceJob.RecomputePrice: {
        const { productId, storeId } = job.data as RecomputePriceData;
        const outcome = await this.recompute.execute(productId, storeId);
        this.logger.debug(
          `Recomputed ${productId} at ${storeId}: ${outcome.kind}`,
        );
        return { outcome: outcome.kind };
      }

      case PriceIntelligenceJob.AggregateDay: {
        const { date } = (job.data ?? {}) as AggregateDayData;
        // The scheduled run aggregates yesterday: today is still collecting.
        const day = date
          ? new Date(`${date}T00:00:00Z`)
          : new Date(Date.now() - DAY_MS);

        return this.aggregate.execute(day);
      }

      default:
        throw new Error(
          `Unsupported job "${job.name}" on ${PRICE_INTELLIGENCE_QUEUE}`,
        );
    }
  }
}
