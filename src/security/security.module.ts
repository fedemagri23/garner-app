import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenService } from './application/access-token.service.js';
import { PASSWORD_HASHER } from './domain/password-hasher.port.js';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher.js';
import { RedisRateLimiter } from './infrastructure/redis-rate-limiter.js';
import { JwtAuthGuard } from './presentation/jwt-auth.guard.js';
import { RateLimitGuard } from './presentation/rate-limit.guard.js';
import { RolesGuard } from './presentation/roles.guard.js';

/**
 * Cross-cutting authentication and authorization primitives. Global because
 * guards and the hasher are needed by any module that owns user data; it
 * deliberately contains no knowledge of *who* users are — that is the users
 * module's data.
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [
    AccessTokenService,
    JwtAuthGuard,
    RolesGuard,
    RateLimitGuard,
    RedisRateLimiter,
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
  ],
  exports: [
    AccessTokenService,
    JwtAuthGuard,
    RolesGuard,
    RateLimitGuard,
    RedisRateLimiter,
    PASSWORD_HASHER,
  ],
})
export class SecurityModule {}
