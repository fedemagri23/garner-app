import { Inject, Injectable, Logger } from '@nestjs/common';
import { createDomainEvent } from '../../common/events/domain-event.js';
import {
  DomainEventName,
  type DailyPriceCalculatedEvent,
  type PriceAnomalyDetectedEvent,
} from '../../common/events/event-catalog.js';
import { EventBus } from '../../common/events/event-bus.js';
import {
  PRICE_OBSERVATION_REPOSITORY,
  type PriceObservationRepository,
} from '../../pricing/domain/price-observation.repository.port.js';
import { confidenceScore } from '../domain/price-confidence.js';
import { isAbruptChange, utcDay } from '../domain/price-history.js';
import { selectUsableObservations } from '../domain/observation-selection.js';
import { weightedPrice } from '../domain/price-weighting.js';
import {
  DAILY_PRICE_HISTORY_REPOSITORY,
  type DailyPriceHistoryRepository,
} from '../domain/price-intelligence.repository.port.js';

const TARGET_PAGE_SIZE = 200;
const MAX_OBSERVATIONS_PER_TARGET = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface AggregationSummary {
  date: Date;
  targets: number;
  written: number;
  anomalies: number;
}

/**
 * Compresses a day of raw observations into one row per product and store.
 *
 * This is what makes history affordable: observations expire after the
 * retention window, while these daily rows are small enough to keep for years.
 *
 * Re-running a day is safe and is expected — a day may be aggregated again
 * after late-arriving observations, or to apply a changed weighting — because
 * each row is written by upsert and derived only from what is in the database.
 */
@Injectable()
export class AggregateDailyPricesUseCase {
  private readonly logger = new Logger(AggregateDailyPricesUseCase.name);

  constructor(
    @Inject(PRICE_OBSERVATION_REPOSITORY)
    private readonly observations: PriceObservationRepository,
    @Inject(DAILY_PRICE_HISTORY_REPOSITORY)
    private readonly history: DailyPriceHistoryRepository,
    private readonly events: EventBus,
  ) {}

  async execute(day: Date): Promise<AggregationSummary> {
    const date = utcDay(day);
    const from = date;
    const to = new Date(date.getTime() + DAY_MS);

    // Weigh the day's observations as of its end, so a day aggregated now and
    // the same day re-aggregated next month produce the same numbers.
    const asOf = to;

    const summary: AggregationSummary = {
      date,
      targets: 0,
      written: 0,
      anomalies: 0,
    };

    for (let page = 0; ; page++) {
      const targets = await this.observations.listAggregationTargets({
        from,
        to,
        skip: page * TARGET_PAGE_SIZE,
        take: TARGET_PAGE_SIZE,
      });

      if (targets.length === 0) {
        break;
      }

      summary.targets += targets.length;

      for (const target of targets) {
        const written = await this.aggregateTarget(target, from, to, asOf, date);

        if (written === 'written') {
          summary.written += 1;
        } else if (written === 'anomaly') {
          summary.written += 1;
          summary.anomalies += 1;
        }
      }

      if (targets.length < TARGET_PAGE_SIZE) {
        break;
      }
    }

    this.logger.log(
      `Aggregated ${date.toISOString().slice(0, 10)}: ` +
        `${summary.written} of ${summary.targets} product/store pairs, ` +
        `${summary.anomalies} anomalous`,
    );

    return summary;
  }

  private async aggregateTarget(
    target: { productId: string; storeId: string; currency: string },
    from: Date,
    to: Date,
    asOf: Date,
    date: Date,
  ): Promise<'written' | 'anomaly' | 'skipped'> {
    const observations = await this.observations.findInWindow({
      productId: target.productId,
      storeId: target.storeId,
      from,
      to,
      limit: MAX_OBSERVATIONS_PER_TARGET,
    });

    const { usable } = selectUsableObservations(
      observations.filter(
        (observation) => observation.currency === target.currency,
      ),
    );

    const computed = weightedPrice(usable, asOf);

    // A day whose every observation was quarantined gets no row: an empty day
    // and a discarded day should not look the same in the history.
    if (!computed) {
      return 'skipped';
    }

    const previous = await this.history.findPreviousDay(
      target.productId,
      target.storeId,
      date,
    );

    const isAnomalous = isAbruptChange(
      previous?.weightedAverageCents ?? null,
      computed.priceCents,
    );

    await this.history.upsert({
      productId: target.productId,
      storeId: target.storeId,
      date,
      currency: target.currency,
      weightedAverageCents: computed.priceCents,
      minPriceCents: computed.minPriceCents,
      maxPriceCents: computed.maxPriceCents,
      observationCount: computed.observationCount,
      confidence: confidenceScore(computed, asOf),
      isAnomalous,
    });

    const isoDate = date.toISOString().slice(0, 10);

    const calculated: DailyPriceCalculatedEvent = createDomainEvent(
      DomainEventName.DailyPriceCalculated,
      {
        productId: target.productId,
        storeId: target.storeId,
        date: isoDate,
        weightedAverageCents: computed.priceCents,
        observationCount: computed.observationCount,
        confidence: confidenceScore(computed, asOf),
      },
    );
    await this.events.publish(calculated);

    if (isAnomalous && previous) {
      const anomaly: PriceAnomalyDetectedEvent = createDomainEvent(
        DomainEventName.PriceAnomalyDetected,
        {
          productId: target.productId,
          storeId: target.storeId,
          date: isoDate,
          previousAverageCents: previous.weightedAverageCents,
          currentAverageCents: computed.priceCents,
        },
      );
      await this.events.publish(anomaly);

      this.logger.warn(
        `Price anomaly for product ${target.productId} at store ${target.storeId} ` +
          `on ${isoDate}: ${previous.weightedAverageCents} → ${computed.priceCents}`,
      );
    }

    return isAnomalous ? 'anomaly' : 'written';
  }
}
