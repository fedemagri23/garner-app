import { Module } from '@nestjs/common';
import { ShoppingListsModule } from '../shopping-lists/shopping-lists.module.js';
import { ChangeSessionStatusUseCase } from './application/change-session-status.use-case.js';
import { ListShoppingSessionsUseCase } from './application/list-shopping-sessions.use-case.js';
import { RecordItemProgressUseCase } from './application/record-item-progress.use-case.js';
import { ShoppingSessionAccess } from './application/shopping-session-access.js';
import { ShoppingSessionViewBuilder } from './application/shopping-session-view.js';
import { StartShoppingSessionUseCase } from './application/start-shopping-session.use-case.js';
import { SHOPPING_SESSION_REPOSITORY } from './domain/shopping-session.repository.port.js';
import { PrismaShoppingSessionRepository } from './infrastructure/prisma-shopping-session.repository.js';
import { ShoppingSessionsController } from './presentation/shopping-sessions.controller.js';

/**
 * Owns shopping trips and the purchases recorded during them. Reads lists
 * through ShoppingListsModule's exports, and publishes ShoppingSessionCompleted
 * for the pricing work phase 4 hangs off it.
 */
@Module({
  imports: [ShoppingListsModule],
  controllers: [ShoppingSessionsController],
  providers: [
    StartShoppingSessionUseCase,
    RecordItemProgressUseCase,
    ChangeSessionStatusUseCase,
    ListShoppingSessionsUseCase,
    ShoppingSessionAccess,
    ShoppingSessionViewBuilder,
    {
      provide: SHOPPING_SESSION_REPOSITORY,
      useClass: PrismaShoppingSessionRepository,
    },
  ],
  exports: [SHOPPING_SESSION_REPOSITORY],
})
export class ShoppingSessionsModule {}
