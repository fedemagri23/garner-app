import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  assertOwnership,
  type AuthenticatedUser,
} from '../../security/domain/authenticated-user.js';
import {
  PRODUCT_REPOSITORY,
  type ProductRepository,
} from '../../products/domain/product.repository.port.js';
import {
  STORE_LOCATION_REPOSITORY,
  type StoreLocationRepository,
} from '../../supermarkets/domain/supermarket.repository.port.js';
import type { PriceAlert, PriceAlertType } from '../domain/price-alert.entity.js';
import {
  PRICE_ALERT_REPOSITORY,
  type PriceAlertRepository,
} from '../domain/notification.repository.port.js';

export interface CreatePriceAlertCommand {
  productId: string;
  type: PriceAlertType;
  storeId?: string;
  thresholdCents?: number;
  dropPercent?: number;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
}

/**
 * Alerts are opt-in and owned: a shopper creates their own, sees only their
 * own, and each one names exactly what it watches.
 */
@Injectable()
export class ManagePriceAlertsUseCase {
  constructor(
    @Inject(PRICE_ALERT_REPOSITORY)
    private readonly alerts: PriceAlertRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(STORE_LOCATION_REPOSITORY)
    private readonly stores: StoreLocationRepository,
  ) {}

  async create(
    actor: AuthenticatedUser,
    command: CreatePriceAlertCommand,
  ): Promise<PriceAlert> {
    if (!(await this.products.findById(command.productId))) {
      throw new NotFoundException('Product not found');
    }

    if (command.storeId && !(await this.stores.findById(command.storeId))) {
      throw new NotFoundException('Store not found');
    }

    this.assertComplete(command);

    return this.alerts.create({
      ownerId: actor.id,
      productId: command.productId,
      type: command.type,
      storeId: command.storeId ?? null,
      thresholdCents: command.thresholdCents ?? null,
      dropPercent: command.dropPercent ?? null,
      latitude: command.latitude ?? null,
      longitude: command.longitude ?? null,
      radiusKm: command.radiusKm ?? null,
    });
  }

  listMine(
    actor: AuthenticatedUser,
    page: { skip: number; take: number },
  ): Promise<{ alerts: PriceAlert[]; totalItems: number }> {
    return this.alerts.findByOwner(actor.id, page);
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    input: { isEnabled?: boolean; thresholdCents?: number; dropPercent?: number },
  ): Promise<PriceAlert> {
    await this.loadOwned(id, actor);
    return this.alerts.update(id, input);
  }

  /** Deleting an alert that is already gone succeeds, so a retry does too. */
  async delete(actor: AuthenticatedUser, id: string): Promise<void> {
    const alert = await this.alerts.findById(id);

    if (!alert) {
      return;
    }

    assertOwnership(alert.ownerId, actor);
    await this.alerts.delete(id);
  }

  private async loadOwned(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<PriceAlert> {
    const alert = await this.alerts.findById(id);

    if (!alert) {
      throw new NotFoundException('Price alert not found');
    }

    assertOwnership(alert.ownerId, actor);
    return alert;
  }

  /** Each kind of alert needs the figures that make it answerable. */
  private assertComplete(command: CreatePriceAlertCommand): void {
    if (command.type === 'BELOW_THRESHOLD' && !command.thresholdCents) {
      throw new BadRequestException(
        'A threshold alert needs thresholdCents above zero',
      );
    }

    if (command.type === 'PRICE_DROP' && !command.dropPercent) {
      throw new BadRequestException(
        'A price-drop alert needs dropPercent above zero',
      );
    }

    if (command.type === 'CHEAPER_NEARBY') {
      const located =
        command.latitude !== undefined &&
        command.longitude !== undefined &&
        command.radiusKm !== undefined;

      if (!located) {
        throw new BadRequestException(
          'A cheaper-nearby alert needs latitude, longitude and radiusKm',
        );
      }
    }
  }
}
