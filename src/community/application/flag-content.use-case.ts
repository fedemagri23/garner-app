import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import {
  COMMUNITY_REPOSITORY,
  type CommunityRepository,
  type FlagReason,
  type FlagTarget,
} from '../domain/community.port.js';
import { shouldHide } from '../domain/moderation-policy.js';
import { CommunityPolicy } from './community-policy.js';
import { ProductStanding } from './product-standing.js';

const LONG_AGO = new Date(0);

/**
 * "This is wrong": a duplicate, wrong details, a shop or product that does not
 * exist, or something inappropriate. Each flag lowers a product's rank; once
 * enough trusted people agree, the entry leaves search until a moderator looks
 * (`shouldHide`). Who flagged is never told to the entry's creator.
 */
@Injectable()
export class FlagContentUseCase {
  constructor(
    @Inject(COMMUNITY_REPOSITORY) private readonly community: CommunityRepository,
    private readonly policy: CommunityPolicy,
    private readonly standing: ProductStanding,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    target: FlagTarget,
    targetId: string,
    reason: FlagReason,
  ): Promise<void> {
    const owner = await this.ownerOf(target, targetId);
    if (owner === actor.id) {
      throw new ForbiddenException('You cannot report something you added');
    }

    await this.policy.assertMayFlag(actor.id);
    if (!(await this.community.flag(target, targetId, actor.id, reason))) {
      return; // Already flagged by this person: nothing changes.
    }

    const flaggers = await this.community.flaggers(target, targetId);
    if (target === 'PRODUCT') {
      await this.standing.refresh(targetId);
    } else {
      await this.community.setStoreFlagCount(targetId, flaggers.length);
    }

    const trusts = await Promise.all(flaggers.map((userId) => this.policy.trust(userId)));
    if (shouldHide(trusts.map((trust) => ({ trust })))) {
      const pulled = await this.community.setModeration(target, targetId, 'UNDER_REVIEW');
      if (pulled) {
        await this.community.audit({
          actorId: null,
          action: 'pulled-by-flags',
          targetType: target,
          targetId,
          note: `${flaggers.length} flags`,
        });
      }
    }
  }

  /** The entry's creator (null for the team's); 404 when it does not exist. */
  private async ownerOf(target: FlagTarget, targetId: string): Promise<string | null> {
    if (target === 'PRODUCT') {
      const signals = await this.community.productSignals(targetId, LONG_AGO);
      if (!signals) throw new NotFoundException('Product not found');
      return signals.createdById;
    }
    const store = await this.community.storeStanding(targetId);
    if (!store) throw new NotFoundException('Store not found');
    return store.createdById;
  }
}
