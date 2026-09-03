import { Injectable, Logger } from '@nestjs/common';
import { CorePrismaService } from '../database/core-prisma.service.js';
import { IntelligencePrismaService } from '../database/intelligence-prisma.service.js';
import { PricingPrismaService } from '../database/pricing-prisma.service.js';
import { RedisService } from '../redis/redis.service.js';

export type DependencyStatus = 'up' | 'down';

export interface HealthReport {
  status: 'ok' | 'degraded';
  checks: Record<string, { status: DependencyStatus; error?: string }>;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly core: CorePrismaService,
    private readonly pricing: PricingPrismaService,
    private readonly intelligence: IntelligencePrismaService,
    private readonly redis: RedisService,
  ) {}

  async check(): Promise<HealthReport> {
    const [coreDb, pricingDb, intelligenceDb, redis] = await Promise.all([
      this.probe('core_db', () => this.core.$queryRaw`SELECT 1`),
      this.probe('pricing_db', () => this.pricing.$queryRaw`SELECT 1`),
      this.probe('intelligence_db', () => this.intelligence.$queryRaw`SELECT 1`),
      this.probe('redis', () => this.redis.ping()),
    ]);

    const checks = {
      core_db: coreDb,
      pricing_db: pricingDb,
      intelligence_db: intelligenceDb,
      redis,
    };

    const healthy = Object.values(checks).every(
      (check) => check.status === 'up',
    );

    return { status: healthy ? 'ok' : 'degraded', checks };
  }

  private async probe(
    name: string,
    run: () => Promise<unknown>,
  ): Promise<{ status: DependencyStatus; error?: string }> {
    try {
      await run();
      return { status: 'up' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Health check for ${name} failed: ${message}`);
      return { status: 'down', error: message };
    }
  }
}
