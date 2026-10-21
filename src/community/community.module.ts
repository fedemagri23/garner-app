import { Module } from '@nestjs/common';
import { CommunityPolicy } from './application/community-policy.js';
import { ConfirmProductUseCase } from './application/confirm-product.use-case.js';
import { FlagContentUseCase } from './application/flag-content.use-case.js';
import { ModerateUseCase } from './application/moderate.use-case.js';
import { PriceAcceptedListener } from './application/price-accepted.listener.js';
import { ProductStanding } from './application/product-standing.js';
import { MyAdditionsUseCase } from './application/my-additions.use-case.js';
import { SuggestProductsUseCase } from './application/suggest-products.use-case.js';
import { COMMUNITY_REPOSITORY } from './domain/community.port.js';
import { PrismaCommunityRepository } from './infrastructure/prisma-community.repository.js';
import {
  ModerationController,
  MyAdditionsController,
  ProductCommunityController,
  ProductSuggestionsController,
  StoreCommunityController,
} from './presentation/community.controller.js';

/**
 * What shoppers add to the catalog and what others make of it: confirmations,
 * flags, ranking, publishing shops, and the team's moderation.
 *
 * Depends on no other module: the products and supermarkets modules import it
 * for `CommunityPolicy` when a shopper creates something.
 */
@Module({
  controllers: [
    ProductSuggestionsController,
    ProductCommunityController,
    StoreCommunityController,
    ModerationController,
    MyAdditionsController,
  ],
  providers: [
    CommunityPolicy,
    ProductStanding,
    ConfirmProductUseCase,
    FlagContentUseCase,
    ModerateUseCase,
    SuggestProductsUseCase,
    MyAdditionsUseCase,
    PriceAcceptedListener,
    { provide: COMMUNITY_REPOSITORY, useClass: PrismaCommunityRepository },
  ],
  exports: [CommunityPolicy, COMMUNITY_REPOSITORY],
})
export class CommunityModule {}
