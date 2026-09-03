import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app-setup.js';
import { CorePrismaService } from '../../src/common/database/core-prisma.service.js';

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
 * Integration tests own their data. Deleting users cascades to their refresh
 * tokens, so this is enough to leave the database as it was found.
 */
export async function resetDatabase(app: INestApplication): Promise<void> {
  const prisma = app.get(CorePrismaService);
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
}

let sequence = 0;

/** Unique per call so parallel or repeated runs never collide on the email unique index. */
export function uniqueEmail(prefix = 'user'): string {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}@example.test`;
}
