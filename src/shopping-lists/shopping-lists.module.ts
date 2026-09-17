import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module.js';
import { SupermarketsModule } from '../supermarkets/supermarkets.module.js';
import { CatalogReferences } from './application/catalog-references.js';
import { ManageListItemsUseCase } from './application/manage-list-items.use-case.js';
import { ManageShoppingListsUseCase } from './application/manage-shopping-lists.use-case.js';
import { ShoppingListAccess } from './application/shopping-list-access.js';
import { ShoppingListViewBuilder } from './application/shopping-list-view.js';
import { SHOPPING_LIST_REPOSITORY } from './domain/shopping-list.repository.port.js';
import { PrismaShoppingListRepository } from './infrastructure/prisma-shopping-list.repository.js';
import { ShoppingListsController } from './presentation/shopping-lists.controller.js';

/**
 * Owns shopping lists and their items. Reads products and stores through the
 * catalog modules' ports. Exports its own repository port, plus the list
 * access and catalog lookups, for the shopping-sessions module that starts a
 * trip from a list.
 */
@Module({
  imports: [ProductsModule, SupermarketsModule],
  controllers: [ShoppingListsController],
  providers: [
    ManageShoppingListsUseCase,
    ManageListItemsUseCase,
    ShoppingListAccess,
    CatalogReferences,
    ShoppingListViewBuilder,
    {
      provide: SHOPPING_LIST_REPOSITORY,
      useClass: PrismaShoppingListRepository,
    },
  ],
  exports: [SHOPPING_LIST_REPOSITORY, ShoppingListAccess, CatalogReferences],
})
export class ShoppingListsModule {}
