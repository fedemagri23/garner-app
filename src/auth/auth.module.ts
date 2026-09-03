import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { IssueTokenPairService } from './application/issue-token-pair.service.js';
import { LoginUseCase } from './application/login.use-case.js';
import { LogoutUseCase } from './application/logout.use-case.js';
import { RefreshTokensUseCase } from './application/refresh-tokens.use-case.js';
import { RegisterUseCase } from './application/register.use-case.js';
import { REFRESH_TOKEN_REPOSITORY } from './domain/refresh-token.repository.port.js';
import { PrismaRefreshTokenRepository } from './infrastructure/prisma-refresh-token.repository.js';
import { AuthController } from './presentation/auth.controller.js';

/**
 * Owns session state (refresh tokens) but not accounts: it reaches users
 * through USER_REPOSITORY, the port UsersModule exports, and never queries the
 * users table itself.
 */
@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [
    RegisterUseCase,
    LoginUseCase,
    RefreshTokensUseCase,
    LogoutUseCase,
    IssueTokenPairService,
    {
      provide: REFRESH_TOKEN_REPOSITORY,
      useClass: PrismaRefreshTokenRepository,
    },
  ],
})
export class AuthModule {}
