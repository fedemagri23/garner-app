import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createDomainEvent } from '../../common/events/domain-event.js';
import {
  DomainEventName,
  type PriceObservationAcceptedEvent,
  type PriceObservationCreatedEvent,
  type PriceObservationPayload,
  type PriceObservationRejectedEvent,
} from '../../common/events/event-catalog.js';
import { EventBus } from '../../common/events/event-bus.js';
import {
  PRODUCT_REPOSITORY,
  type ProductRepository,
} from '../../products/domain/product.repository.port.js';
import {
  STORE_LOCATION_REPOSITORY,
  type StoreLocationRepository,
} from '../../supermarkets/domain/supermarket.repository.port.js';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../users/domain/user.repository.port.js';
import {
  isUserSubmitted,
  ReviewReason,
  type PriceObservation,
  type PriceSourceType,
} from '../domain/price-observation.entity.js';
import {
  PRICE_OBSERVATION_REPOSITORY,
  SUBMISSION_COUNTER,
  type PriceObservationRepository,
  type SubmissionCounter,
} from '../domain/price-observation.repository.port.js';
import { assessAgainstHistory } from '../domain/price-deviation.js';
import {
  checkPlausibility,
  PLAUSIBILITY_MESSAGES,
} from '../domain/price-plausibility.js';
import {
  decideTrust,
  DUPLICATE_WINDOW_MS,
  HARD_LIMITS,
  REPEATED_DEVIATIONS,
  WINDOWS,
  type TrustSignals,
} from '../domain/submission-policy.js';

export interface IngestPriceObservationCommand {
  /** Client-generated id; a retry with the same id returns the stored observation. */
  id?: string;
  productId: string;
  storeId: string;
  priceCents: number;
  currency: string;
  observedAt: Date;
  sourceType: PriceSourceType;
  userId: string | null;
  /** Only for user submissions arriving over HTTP. Counted, never stored. */
  clientIp?: string | null;
  shoppingSessionId?: string | null;
  /** Natural identity of the observation, e.g. one purchased line of a trip. */
  dedupeKey?: string | null;
  evidence?: { photoKey: string | null; note: string | null };
}

export interface IngestResult {
  observation: PriceObservation;
  /** False when this was a retry or a duplicate of something already stored. */
  created: boolean;
}

/** How far back recent prices are sampled for the deviation check. */
const REFERENCE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const REFERENCE_SAMPLE_LIMIT = 50;

/**
 * The single entry point for every price entering the system — shelf reports,
 * confirmed purchases, and (phase 6) supermarket feeds all pass through here:
 *
 *   plausibility → replay/duplicate → catalog → rate limits → trust → store → events
 *
 * Input that cannot be a price is refused and nothing is stored. Input that is
 * a price but looks wrong is stored with a status, so abuse leaves a trail and
 * a flagged price can later be confirmed.
 */
@Injectable()
export class IngestPriceObservationService {
  private readonly logger = new Logger(IngestPriceObservationService.name);

  constructor(
    @Inject(PRICE_OBSERVATION_REPOSITORY)
    private readonly observations: PriceObservationRepository,
    @Inject(SUBMISSION_COUNTER) private readonly counter: SubmissionCounter,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(STORE_LOCATION_REPOSITORY)
    private readonly stores: StoreLocationRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly events: EventBus,
  ) {}

  async ingest(command: IngestPriceObservationCommand): Promise<IngestResult> {
    const now = new Date();

    const problem = checkPlausibility(command, now);
    if (problem) {
      throw new BadRequestException(PLAUSIBILITY_MESSAGES[problem]);
    }

    const replay = await this.findReplay(command);
    if (replay) {
      return { observation: replay, created: false };
    }

    await this.assertCatalogTargets(command);

    const userSubmitted = isUserSubmitted(command.sourceType);

    if (userSubmitted && command.userId) {
      const duplicate = await this.observations.findRecentDuplicate({
        userId: command.userId,
        productId: command.productId,
        storeId: command.storeId,
        priceCents: command.priceCents,
        currency: command.currency,
        since: new Date(now.getTime() - DUPLICATE_WINDOW_MS),
      });

      // The same report sent twice — a double tap or a retry without an id.
      if (duplicate) {
        return { observation: duplicate, created: false };
      }
    }

    const signals = await this.collectSignals(command, now);
    const decision = decideTrust(signals);

    const { observation, created } = await this.observations.create({
      id: command.id,
      productId: command.productId,
      storeId: command.storeId,
      priceCents: command.priceCents,
      currency: command.currency,
      observedAt: command.observedAt,
      sourceType: command.sourceType,
      status: decision.status,
      reviewReasons: decision.reasons,
      userId: command.userId,
      shoppingSessionId: command.shoppingSessionId ?? null,
      dedupeKey: command.dedupeKey ?? null,
      evidencePhotoKey: command.evidence?.photoKey ?? null,
      evidenceNote: command.evidence?.note ?? null,
    });

    if (!created) {
      this.assertReplayBelongsToCaller(observation, command);
      return { observation, created };
    }

    if (decision.status !== 'ACCEPTED') {
      this.logger.warn(
        `Observation ${observation.id} ${decision.status.toLowerCase()} ` +
          `(user ${command.userId ?? '-'}, product ${command.productId}, ` +
          `store ${command.storeId}): ${decision.reasons.join(', ')}`,
      );
    }

    await this.publish(observation);

    return { observation, created };
  }

  private async findReplay(
    command: IngestPriceObservationCommand,
  ): Promise<PriceObservation | null> {
    if (command.id) {
      const existing = await this.observations.findById(command.id);
      if (existing) {
        this.assertReplayBelongsToCaller(existing, command);
        return existing;
      }
    }

    if (command.dedupeKey) {
      return this.observations.findByDedupeKey(command.dedupeKey);
    }

    return null;
  }

  private assertReplayBelongsToCaller(
    existing: PriceObservation,
    command: IngestPriceObservationCommand,
  ): void {
    if (existing.userId !== command.userId) {
      throw new ConflictException('This id is already in use');
    }
  }

  /**
   * A person may only report prices for products and stores that are still
   * live. A purchase already happened, so it is recorded even if the product
   * has been retired since.
   */
  private async assertCatalogTargets(
    command: IngestPriceObservationCommand,
  ): Promise<void> {
    const [product, store] = await Promise.all([
      this.products.findById(command.productId),
      this.stores.findById(command.storeId),
    ]);

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    if (isUserSubmitted(command.sourceType)) {
      if (!product.isActive) {
        throw new UnprocessableEntityException(
          'This product has been retired from the catalog',
        );
      }

      if (!store.isActive) {
        throw new UnprocessableEntityException('This store is no longer active');
      }
    }
  }

  private async collectSignals(
    command: IngestPriceObservationCommand,
    now: Date,
  ): Promise<TrustSignals> {
    const volume = isUserSubmitted(command.sourceType)
      ? await this.countUserSubmission(command)
      : { account: 0, accountTarget: 0, product: 0, store: 0 };

    const since = new Date(now.getTime() - REFERENCE_WINDOW_MS);

    const [sameStore, anyStore, account, recentDeviations] = await Promise.all([
      this.observations.recentAcceptedPrices({
        productId: command.productId,
        storeId: command.storeId,
        currency: command.currency,
        since,
        limit: REFERENCE_SAMPLE_LIMIT,
      }),
      this.observations.recentAcceptedPrices({
        productId: command.productId,
        currency: command.currency,
        since,
        limit: REFERENCE_SAMPLE_LIMIT,
      }),
      command.userId ? this.users.findById(command.userId) : null,
      command.userId
        ? this.observations.countByUserWithReasonSince(
            command.userId,
            [ReviewReason.PriceDeviation, ReviewReason.ExtremePriceDeviation],
            new Date(now.getTime() - REPEATED_DEVIATIONS.lookbackMs),
          )
        : 0,
    ]);

    return {
      sourceType: command.sourceType,
      accountAgeMs: account ? now.getTime() - account.createdAt.getTime() : null,
      deviation: assessAgainstHistory(command.priceCents, sameStore, anyStore),
      accountSubmissionsLastHour: volume.account,
      accountTargetSubmissionsLastDay: volume.accountTarget,
      productSubmissionsLastHour: volume.product,
      storeSubmissionsLastHour: volume.store,
      recentDeviationsByAccount: recentDeviations,
    };
  }

  /**
   * Counts this submission against every window, then enforces the hard
   * limits. Attempts are counted before the check, so hammering past a limit
   * keeps the window full rather than draining it.
   */
  private async countUserSubmission(
    command: IngestPriceObservationCommand,
  ): Promise<{ account: number; accountTarget: number; product: number; store: number }> {
    const userId = command.userId ?? 'anonymous';
    const target = `${command.productId}:${command.storeId}`;

    const keys = [
      { key: `price-submissions:account:${userId}`, windowSeconds: WINDOWS.hour },
      { key: `price-submissions:account-target:${userId}:${target}`, windowSeconds: WINDOWS.day },
      { key: `price-submissions:product:${command.productId}`, windowSeconds: WINDOWS.hour },
      { key: `price-submissions:store:${command.storeId}`, windowSeconds: WINDOWS.hour },
    ];

    if (command.clientIp) {
      keys.push({
        key: `price-submissions:ip:${command.clientIp}`,
        windowSeconds: WINDOWS.hour,
      });
    }

    const [account, accountTarget, product, store, ip = 0] =
      await this.counter.hit(keys);

    const exceeded =
      account > HARD_LIMITS.perAccount.max ||
      accountTarget > HARD_LIMITS.perAccountTarget.max ||
      ip > HARD_LIMITS.perIp.max;

    if (exceeded) {
      this.logger.warn(
        `Price submission rate limit hit (user ${userId}, target ${target}, ` +
          `ip ${command.clientIp ?? '-'}): account=${account} target=${accountTarget} ip=${ip}`,
      );

      throw new HttpException(
        {
          error: 'Too Many Requests',
          message: 'Too many price reports, please try again later',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return { account, accountTarget, product, store };
  }

  private async publish(observation: PriceObservation): Promise<void> {
    const payload: PriceObservationPayload = {
      observationId: observation.id,
      productId: observation.productId,
      storeId: observation.storeId,
      priceCents: observation.priceCents,
      currency: observation.currency,
      observedAt: observation.observedAt.toISOString(),
      sourceType: observation.sourceType,
      status: observation.status,
      userId: observation.userId,
    };

    const created: PriceObservationCreatedEvent = createDomainEvent(
      DomainEventName.PriceObservationCreated,
      payload,
    );
    await this.events.publish(created);

    if (observation.status === 'ACCEPTED') {
      const accepted: PriceObservationAcceptedEvent = createDomainEvent(
        DomainEventName.PriceObservationAccepted,
        payload,
      );
      await this.events.publish(accepted);
    }

    if (observation.status === 'REJECTED') {
      const rejected: PriceObservationRejectedEvent = createDomainEvent(
        DomainEventName.PriceObservationRejected,
        payload,
      );
      await this.events.publish(rejected);
    }
  }
}
