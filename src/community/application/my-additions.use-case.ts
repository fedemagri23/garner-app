import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import {
  COMMUNITY_REPOSITORY,
  type AddedProduct,
  type AddedStore,
  type CommunityRepository,
  type FlagTarget,
  type ViewerSay,
} from '../domain/community.port.js';

const LONG_AGO = new Date(0);
const MAX_LISTED = 100;

/** What one person sees of their own part in the catalog. */
@Injectable()
export class MyAdditionsUseCase {
  constructor(@Inject(COMMUNITY_REPOSITORY) private readonly community: CommunityRepository) {}

  /** The products and shops they added, hidden ones too: they should know. */
  list(actor: AuthenticatedUser): Promise<{ products: AddedProduct[]; stores: AddedStore[] }> {
    return this.community.addedBy(actor.id, MAX_LISTED);
  }

  /**
   * Whether they added the entry, confirmed it or reported it, so the app
   * offers only what makes sense. Someone else's private shop is a 404, as
   * everywhere else.
   */
  async say(actor: AuthenticatedUser, target: FlagTarget, id: string): Promise<ViewerSay & { addedByYou: boolean }> {
    const createdById = await this.creatorOf(actor, target, id);
    return { addedByYou: createdById === actor.id, ...(await this.community.viewerSay(target, id, actor.id)) };
  }

  private async creatorOf(actor: AuthenticatedUser, target: FlagTarget, id: string): Promise<string | null> {
    if (target === 'PRODUCT') {
      const signals = await this.community.productSignals(id, LONG_AGO);
      if (!signals) throw new NotFoundException('Product not found');
      return signals.createdById;
    }
    const store = await this.community.storeStanding(id);
    if (!store || (store.publishedAt === null && store.createdById !== actor.id)) {
      throw new NotFoundException('Store not found');
    }
    return store.createdById;
  }
}
