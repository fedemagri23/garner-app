import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app-setup.js';
import { CorePrismaService } from '../../src/common/database/core-prisma.service.js';
import { IntelligencePrismaService } from '../../src/common/database/intelligence-prisma.service.js';
import { PricingPrismaService } from '../../src/common/database/pricing-prisma.service.js';
import { RedisService } from '../../src/common/redis/redis.service.js';

/**
 * Boots the real application graph against the test databases, through the
 * same `configureApp` the production process uses — so a pipe, guard or filter
 * can never be configured in one and missing in the other.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return app;
}

/**
 * Integration tests own their data. Deleted in dependency order: shopping rows
 * reference products and stores, and categories are referenced by products,
 * so each goes before what it points at.
 */
export async function resetDatabase(app: INestApplication): Promise<void> {
  const prisma = app.get(CorePrismaService);

  // Shopping first: its items restrict deleting the products they point at.
  await prisma.shoppingSessionItem.deleteMany();
  await prisma.shoppingSession.deleteMany();
  await prisma.shoppingListItem.deleteMany();
  await prisma.shoppingList.deleteMany();

  await prisma.optimizationRequest.deleteMany();
  await prisma.optimizationPreferences.deleteMany();
  await prisma.userPreferences.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  await prisma.productBarcode.deleteMany();
  await prisma.product.deleteMany();
  await prisma.brand.deleteMany();
  // Children before parents: the self-relation is `onDelete: Restrict`.
  await prisma.category.deleteMany({ where: { parentId: { not: null } } });
  await prisma.category.deleteMany();

  await prisma.storeOpeningHours.deleteMany();
  await prisma.storeLocation.deleteMany();
  await prisma.supermarket.deleteMany();

  const pricing = app.get(PricingPrismaService);
  await pricing.priceObservation.deleteMany();
  await pricing.sessionContribution.deleteMany();
  // Runs and links cascade from their source.
  await pricing.externalPriceSource.deleteMany();

  const intelligence = app.get(IntelligencePrismaService);
  await intelligence.derivedPrice.deleteMany();
  await intelligence.dailyPriceHistory.deleteMany();

  // Submission windows last up to a day. Every test run reports from the same
  // loopback address, so without this the per-IP limit would carry over and
  // throttle the next run.
  await deleteRedisKeys(app, 'price-submissions:*');
  await deleteRedisKeys(app, 'evidence-uploads:*');
  await deleteRedisKeys(app, 'prices:*');
}

async function deleteRedisKeys(
  app: INestApplication,
  pattern: string,
): Promise<void> {
  const redis = app.get(RedisService).client;
  let cursor = '0';

  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    cursor = next;
  } while (cursor !== '0');
}

/**
 * Registers an account and promotes it, for the catalog routes that only
 * moderators and administrators may call. The role is set straight in the
 * database on purpose — there is no API for granting a role, and there should
 * not be one.
 */
export async function registerWithRole(
  app: INestApplication,
  role: 'USER' | 'MODERATOR' | 'ADMIN',
  email = uniqueEmail(role.toLowerCase()),
): Promise<{ accessToken: string; email: string; id: string }> {
  const server = app.getHttpServer() as Parameters<typeof request>[0];

  await request(server)
    .post('/v1/auth/register')
    .send({ email, password: 'correct-horse-battery', displayName: 'Curator' })
    .expect(201);

  const prisma = app.get(CorePrismaService);
  const user = await prisma.user.update({ where: { email }, data: { role } });

  // Log in again so the access token carries the new role.
  const login = await request(server)
    .post('/v1/auth/login')
    .send({ email, password: 'correct-horse-battery' })
    .expect(200);

  return {
    accessToken: (login.body as { accessToken: string }).accessToken,
    email,
    id: user.id,
  };
}

let sequence = 0;

/** Unique per call so parallel or repeated runs never collide on the email unique index. */
export function uniqueEmail(prefix = 'user'): string {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}@example.test`;
}
