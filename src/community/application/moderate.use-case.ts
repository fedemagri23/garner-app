import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createDomainEvent } from '../../common/events/domain-event.js';
import { DomainEventName, type ProductsMergedEvent } from '../../common/events/event-catalog.js';
import { EventBus } from '../../common/events/event-bus.js';
import { PRODUCT_MERGER, type ProductMerger } from '../domain/product-merge.port.js';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import {
  COMMUNITY_REPOSITORY,
  type CommunityRepository,
  type FlagTarget,
  type ReviewItem,
} from '../domain/community.port.js';
import { ProductStanding } from './product-standing.js';

export type ModerationAction = 'verify' | 'hide' | 'restore';

/**
 * What the team does with what shoppers added: vouch for it (it becomes
 * VERIFIED and ranks with the team's own), hide it, or put it back. Every
 * decision is in the audit log.
 */
@Injectable()
export class ModerateUseCase {
  constructor(
    @Inject(COMMUNITY_REPOSITORY) private readonly community: CommunityRepository,
    private readonly standing: ProductStanding,
    @Inject(PRODUCT_MERGER) private readonly merger: ProductMerger,
    private readonly events: EventBus,
  ) {}

  queue(limit = 50): Promise<ReviewItem[]> {
    return this.community.reviewQueue(limit);
  }

  async act(actor: AuthenticatedUser, target: FlagTarget, id: string, action: ModerationAction): Promise<void> {
    const changed = await this.community.setModeration(
      target,
      id,
      action === 'hide' ? 'HIDDEN' : 'ACTIVE',
      { verified: action === 'verify' },
    );
    if (!changed) {
      throw new NotFoundException(target === 'PRODUCT' ? 'Product not found' : 'Store not found');
    }

    if (target === 'PRODUCT') {
      await this.standing.refresh(id);
    }
    await this.community.audit({ actorId: actor.id, action, targetType: target, targetId: id });
  }

  /**
   * Folds a duplicate into the product that stays: its barcodes, list lines,
   * trips, alerts, confirmations and reports move over (in one transaction),
   * then its prices follow in the pricing and intelligence databases.
   */
  async merge(actor: AuthenticatedUser, fromProductId: string, intoProductId: string): Promise<void> {
    const outcome = await this.merger.merge(fromProductId, intoProductId);
    if (outcome === 'not-found') throw new NotFoundException('Product not found');
    if (outcome === 'invalid') {
      throw new BadRequestException('Merge two different products; the one kept must be active and not merged');
    }

    await this.standing.refresh(intoProductId);
    await this.community.audit({
      actorId: actor.id,
      action: 'merged',
      targetType: 'PRODUCT',
      targetId: fromProductId,
      note: `into ${intoProductId}`,
    });
    const event: ProductsMergedEvent = createDomainEvent(DomainEventName.ProductsMerged, {
      fromProductId,
      intoProductId,
    });
    await this.events.publish(event);
  }
}
