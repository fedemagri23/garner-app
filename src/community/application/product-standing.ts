import { Inject, Injectable } from '@nestjs/common';
import { COMMUNITY_REPOSITORY, type CommunityRepository } from '../domain/community.port.js';
import { rankingWeight } from '../domain/ranking-weight.js';

const DAY_MS = 86_400_000;
/** Price updates count toward rank for this long. */
const PRICING_WINDOW_DAYS = 90;

/** Recomputes a product's rank from what people did with it. */
@Injectable()
export class ProductStanding {
  constructor(
    @Inject(COMMUNITY_REPOSITORY) private readonly community: CommunityRepository,
  ) {}

  /** `active` marks that someone just confirmed or priced it. */
  async refresh(productId: string, now: Date = new Date(), active = false): Promise<void> {
    const signals = await this.community.productSignals(
      productId,
      new Date(now.getTime() - PRICING_WINDOW_DAYS * DAY_MS),
    );
    if (!signals) return;

    const lastActivityAt = active ? now : signals.lastActivityAt;
    const weight = rankingWeight({
      origin: signals.origin,
      confirmingUsers: signals.confirmingUsers,
      recentPricingUsers: signals.recentPricingUsers,
      flaggingUsers: signals.flaggingUsers,
      daysSinceActivity: lastActivityAt ? (now.getTime() - lastActivityAt.getTime()) / DAY_MS : 0,
    });

    await this.community.saveProductStanding(productId, {
      weight,
      confirmationCount: signals.confirmingUsers,
      flagCount: signals.flaggingUsers,
      lastActivityAt,
    });
  }
}
