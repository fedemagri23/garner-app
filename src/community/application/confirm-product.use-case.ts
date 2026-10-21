import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import { COMMUNITY_REPOSITORY, type CommunityRepository } from '../domain/community.port.js';
import { ProductStanding } from './product-standing.js';

const LONG_AGO = new Date(0);

/**
 * "It exists and it's right": one person's word for a product someone else
 * added. Saying it twice counts once; taking it back is allowed.
 */
@Injectable()
export class ConfirmProductUseCase {
  constructor(
    @Inject(COMMUNITY_REPOSITORY) private readonly community: CommunityRepository,
    private readonly standing: ProductStanding,
  ) {}

  async confirm(actor: AuthenticatedUser, productId: string): Promise<{ confirmations: number }> {
    await this.checked(actor, productId);
    if (await this.community.confirm(productId, actor.id)) {
      await this.standing.refresh(productId, new Date(), true);
    }
    return this.count(productId);
  }

  async withdraw(actor: AuthenticatedUser, productId: string): Promise<{ confirmations: number }> {
    await this.checked(actor, productId);
    if (await this.community.unconfirm(productId, actor.id)) {
      await this.standing.refresh(productId);
    }
    return this.count(productId);
  }

  private async checked(actor: AuthenticatedUser, productId: string): Promise<void> {
    const signals = await this.community.productSignals(productId, LONG_AGO);
    if (!signals) {
      throw new NotFoundException('Product not found');
    }
    if (signals.createdById === actor.id) {
      throw new ForbiddenException('You cannot confirm a product you added');
    }
  }

  private async count(productId: string): Promise<{ confirmations: number }> {
    const signals = await this.community.productSignals(productId, LONG_AGO);
    return { confirmations: signals?.confirmingUsers ?? 0 };
  }
}
