import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { AppConfigModule } from './common/config/config.module.js';
import { DatabaseModule } from './common/database/database.module.js';
import { EventsModule } from './common/events/events.module.js';
import { HealthModule } from './common/health/health.module.js';
import { AllExceptionsFilter } from './common/http/all-exceptions.filter.js';
import { RequestIdMiddleware } from './common/http/request-id.middleware.js';
import { QueueModule } from './common/queue/queue.module.js';
import { RedisModule } from './common/redis/redis.module.js';
import { ContributionsModule } from './contributions/contributions.module.js';
import { ExternalPriceSourcesModule } from './external-price-sources/external-price-sources.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { OptimizationModule } from './optimization/optimization.module.js';
import { PriceIntelligenceModule } from './price-intelligence/price-intelligence.module.js';
import { PricingModule } from './pricing/pricing.module.js';
import { ProductsModule } from './products/products.module.js';
import { SecurityModule } from './security/security.module.js';
import { JwtAuthGuard } from './security/presentation/jwt-auth.guard.js';
import { RateLimitGuard } from './security/presentation/rate-limit.guard.js';
import { ShoppingListsModule } from './shopping-lists/shopping-lists.module.js';
import { ShoppingSessionsModule } from './shopping-sessions/shopping-sessions.module.js';
import { SupermarketsModule } from './supermarkets/supermarkets.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    // Shared infrastructure. Each is @Global, so domain modules take what they
    // need without importing infrastructure from a sibling domain.
    AppConfigModule,
    DatabaseModule,
    RedisModule,
    QueueModule,
    EventsModule,
    SecurityModule,

    HealthModule,

    // Domain modules. Those beyond auth/users are boundaries only until the
    // phase that owns them lands.
    UsersModule,
    AuthModule,
    ProductsModule,
    SupermarketsModule,
    ShoppingListsModule,
    ShoppingSessionsModule,
    PricingModule,
    ContributionsModule,
    PriceIntelligenceModule,
    ExternalPriceSourcesModule,
    OptimizationModule,
    NotificationsModule,
  ],
  providers: [
    // Order matters: rate limiting runs before authentication so an
    // unauthenticated flood is rejected before it costs a token verification
    // or a password hash.
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*splat');
  }
}
