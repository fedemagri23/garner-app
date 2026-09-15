import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module.js';
import { GetUserProfileUseCase } from './application/get-user-profile.use-case.js';
import { UpdateUserProfileUseCase } from './application/update-user-profile.use-case.js';
import { UserPreferencesUseCase } from './application/user-preferences.use-case.js';
import { USER_PREFERENCES_REPOSITORY } from './domain/user-preferences.repository.port.js';
import { USER_REPOSITORY } from './domain/user.repository.port.js';
import { PrismaUserPreferencesRepository } from './infrastructure/prisma-user-preferences.repository.js';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository.js';
import { UsersController } from './presentation/users.controller.js';

/**
 * Owns account data and the preferences hanging off it. USER_REPOSITORY is
 * exported so other modules (auth today, notifications later) can read users
 * through the port while the Prisma implementation stays private.
 *
 * ProductsModule is imported for one reason: interests are category slugs, and
 * they are validated through the catalog's CATEGORY_REPOSITORY port rather
 * than by a foreign key across two domains' tables.
 */
@Module({
  imports: [ProductsModule],
  controllers: [UsersController],
  providers: [
    GetUserProfileUseCase,
    UpdateUserProfileUseCase,
    UserPreferencesUseCase,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    {
      provide: USER_PREFERENCES_REPOSITORY,
      useClass: PrismaUserPreferencesRepository,
    },
  ],
  exports: [USER_REPOSITORY, USER_PREFERENCES_REPOSITORY],
})
export class UsersModule {}
