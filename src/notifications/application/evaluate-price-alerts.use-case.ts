import { Inject, Injectable, Logger } from '@nestjs/common';
import { createDomainEvent } from '../../common/events/domain-event.js';
import {
  DomainEventName,
  type PriceAlertTriggeredEvent,
} from '../../common/events/event-catalog.js';
import { EventBus } from '../../common/events/event-bus.js';
import {
  DERIVED_PRICE_REPOSITORY,
  type DerivedPriceRepository,
} from '../../price-intelligence/domain/price-intelligence.repository.port.js';
import {
  PRODUCT_REPOSITORY,
  type ProductRepository,
} from '../../products/domain/product.repository.port.js';
import { haversineKm } from '../../supermarkets/domain/geo.js';
import {
  STORE_LOCATION_REPOSITORY,
  type StoreLocationRepository,
} from '../../supermarkets/domain/supermarket.repository.port.js';
import {
  alertDedupeKey,
  deliveryTime,
  evaluateAlert,
  isThrottled,
  type PriceChange,
} from '../domain/alert-rules.js';
import type { PriceAlert } from '../domain/price-alert.entity.js';
import {
  NOTIFICATION_JOBS,
  NOTIFICATION_REPOSITORY,
  PRICE_ALERT_REPOSITORY,
  type NotificationJobs,
  type NotificationRepository,
  type PriceAlertRepository,
} from '../domain/notification.repository.port.js';
import { NotificationPreferencesUseCase } from './notification-preferences.use-case.js';

/** Alerts examined for one price change. Bounded: a popular product may have many. */
const MAX_ALERTS_PER_CHANGE = 500;

export interface EvaluationSummary {
  examined: number;
  raised: number;
}

/**
 * Decides who hears about a price change.
 *
 * Runs in a worker off `DerivedPriceUpdated`, so a shopper submitting a price
 * never waits on other people's alerts, and a slow evaluation cannot hold up
 * the price pipeline.
 */
@Injectable()
export class EvaluatePriceAlertsUseCase {
  private readonly logger = new Logger(EvaluatePriceAlertsUseCase.name);

  constructor(
    @Inject(PRICE_ALERT_REPOSITORY)
    private readonly alerts: PriceAlertRepository,
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: NotificationRepository,
    @Inject(NOTIFICATION_JOBS) private readonly jobs: NotificationJobs,
    @Inject(DERIVED_PRICE_REPOSITORY)
    private readonly prices: DerivedPriceRepository,
    @Inject(STORE_LOCATION_REPOSITORY)
    private readonly stores: StoreLocationRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    private readonly preferences: NotificationPreferencesUseCase,
    private readonly events: EventBus,
  ) {}

  async execute(
    input: {
      productId: string;
      storeId: string;
      priceCents: number;
      previousPriceCents: number | null;
    },
    now: Date = new Date(),
  ): Promise<EvaluationSummary> {
    const alerts = await this.alerts.findEnabledForProduct(
      input.productId,
      MAX_ALERTS_PER_CHANGE,
    );

    if (alerts.length === 0) {
      return { examined: 0, raised: 0 };
    }

    const [store, product] = await Promise.all([
      this.stores.findById(input.storeId),
      this.products.findById(input.productId),
    ]);

    if (!store || !product) {
      return { examined: alerts.length, raised: 0 };
    }

    // Everywhere else this product is priced, for judging "cheapest nearby".
    const elsewhere = (
      await this.prices.findForProduct(input.productId)
    ).filter((price) => price.storeId !== input.storeId);

    let raised = 0;

    for (const alert of alerts) {
      if (await this.considerAlert(alert, input, store, product.name, elsewhere, now)) {
        raised += 1;
      }
    }

    return { examined: alerts.length, raised };
  }

  private async considerAlert(
    alert: PriceAlert,
    input: {
      productId: string;
      storeId: string;
      priceCents: number;
      previousPriceCents: number | null;
    },
    store: { id: string; name: string; latitude: number; longitude: number; supermarket: { name: string } },
    productName: string,
    elsewhere: { storeId: string; priceCents: number }[],
    now: Date,
  ): Promise<boolean> {
    const preferences = await this.preferences.get(alert.ownerId);

    if (!preferences.priceAlertsEnabled) {
      return false;
    }

    if (isThrottled(alert, preferences, now)) {
      return false;
    }

    const change: PriceChange = {
      ...input,
      ...this.nearbyContext(alert, store, elsewhere),
    };

    const decision = evaluateAlert(alert, change);

    if (!decision.triggered) {
      return false;
    }

    const notification = await this.notifications.create({
      userId: alert.ownerId,
      category: 'PRICE_ALERT',
      title: `${productName} is now ${formatPrice(input.priceCents)}`,
      body: bodyFor(decision.reason, productName, store, input),
      productId: input.productId,
      storeId: input.storeId,
      listId: null,
      alertId: alert.id,
      dedupeKey: alertDedupeKey(alert, input),
      // Held rather than dropped when the shopper asked for quiet.
      deliverAt: deliveryTime(preferences, now),
    });

    // Another worker raised the same news first.
    if (!notification) {
      return false;
    }

    await this.alerts.markTriggered(alert.id, now, input.priceCents);

    const event: PriceAlertTriggeredEvent = createDomainEvent(
      DomainEventName.PriceAlertTriggered,
      {
        alertId: alert.id,
        ownerId: alert.ownerId,
        notificationId: notification.id,
        productId: input.productId,
        storeId: input.storeId,
        priceCents: input.priceCents,
        reason: decision.reason,
      },
    );
    await this.events.publish(event);

    await this.jobs.enqueueDelivery(notification.id, notification.deliverAt);

    this.logger.debug(
      `Alert ${alert.id} raised notification ${notification.id} (${decision.reason})`,
    );

    return true;
  }

  /** Distance and the best price elsewhere, for a CHEAPER_NEARBY alert. */
  private nearbyContext(
    alert: PriceAlert,
    store: { latitude: number; longitude: number },
    elsewhere: { storeId: string; priceCents: number }[],
  ): Pick<PriceChange, 'distanceKm' | 'bestOtherNearbyPriceCents'> {
    if (alert.latitude === null || alert.longitude === null) {
      return {};
    }

    return {
      distanceKm: haversineKm(
        { latitude: alert.latitude, longitude: alert.longitude },
        { latitude: store.latitude, longitude: store.longitude },
      ),
      bestOtherNearbyPriceCents:
        elsewhere.length === 0
          ? null
          : Math.min(...elsewhere.map((price) => price.priceCents)),
    };
  }
}

function formatPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

function bodyFor(
  reason: PriceAlert['type'],
  productName: string,
  store: { name: string; supermarket: { name: string } },
  input: { priceCents: number; previousPriceCents: number | null },
): string {
  const where = `${store.supermarket.name} ${store.name}`;
  const price = formatPrice(input.priceCents);

  switch (reason) {
    case 'BELOW_THRESHOLD':
      return `${productName} has reached ${price} at ${where}.`;

    case 'PRICE_DROP': {
      const was =
        input.previousPriceCents === null
          ? ''
          : ` (was ${formatPrice(input.previousPriceCents)})`;
      return `${productName} dropped to ${price}${was} at ${where}.`;
    }

    case 'CHEAPER_NEARBY':
      return `${where} is now the cheapest place near you for ${productName}, at ${price}.`;
  }
}
