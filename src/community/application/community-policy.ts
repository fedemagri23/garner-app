import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  COMMUNITY_REPOSITORY,
  type CommunityRepository,
  type FlagTarget,
} from '../domain/community.port.js';
import { dailyCreationLimit, trustScore } from '../domain/moderation-policy.js';

const DAY_MS = 86_400_000;
/** Flags one person may raise a day: plenty for honest use, too few to bury a catalog. */
export const DAILY_FLAG_LIMIT = 20;

/**
 * The limits on what one person adds to the shared catalog. Exported for the
 * products and supermarkets modules, which own creating products and shops.
 */
@Injectable()
export class CommunityPolicy {
  constructor(
    @Inject(COMMUNITY_REPOSITORY) private readonly community: CommunityRepository,
  ) {}

  async trust(userId: string, now: Date = new Date()): Promise<number> {
    const standing = await this.community.standing(userId);
    return trustScore({
      accepted: standing.acceptedContributions,
      hiddenOrRejected: standing.removedEntries,
      accountAgeDays: (now.getTime() - standing.accountCreatedAt.getTime()) / DAY_MS,
    });
  }

  /** Refuses (429) once a person has added as many products or shops today as they may. */
  async assertMayCreate(userId: string, target: FlagTarget, now: Date = new Date()): Promise<void> {
    const standing = await this.community.standing(userId);
    const ageHours = (now.getTime() - standing.accountCreatedAt.getTime()) / 3_600_000;
    const trust = await this.trust(userId, now);
    const kind = target === 'PRODUCT' ? 'product' : 'store';
    const limit = dailyCreationLimit(kind, { ageHours, trust });
    const today = await this.community.countCreatedSince(target, userId, new Date(now.getTime() - DAY_MS));

    if (today >= limit) {
      throw new HttpException(
        `You can add up to ${limit} ${kind === 'product' ? 'products' : 'shops'} a day`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async assertMayFlag(userId: string, now: Date = new Date()): Promise<void> {
    const today = await this.community.countFlagsSince(userId, new Date(now.getTime() - DAY_MS));
    if (today >= DAILY_FLAG_LIMIT) {
      throw new HttpException(`You can report up to ${DAILY_FLAG_LIMIT} entries a day`, HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
