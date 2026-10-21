import { Inject, Injectable, NotFoundException } from '@nestjs/common';
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
}
