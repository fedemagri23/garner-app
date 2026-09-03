import { Module } from '@nestjs/common';
import { GetUserProfileUseCase } from './application/get-user-profile.use-case.js';
import { USER_REPOSITORY } from './domain/user.repository.port.js';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository.js';
import { UsersController } from './presentation/users.controller.js';

/**
 * Owns account data. USER_REPOSITORY is exported so other modules (auth today,
 * notifications later) can read users through the port while the Prisma
 * implementation stays private to this module.
 */
@Module({
  controllers: [UsersController],
  providers: [
    GetUserProfileUseCase,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
  ],
  exports: [USER_REPOSITORY],
})
export class UsersModule {}
