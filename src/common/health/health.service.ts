import { Injectable, Logger } from '@nestjs/common';
import { CorePrismaService } from '../database/core-prisma.service.js';
import { IntelligencePrismaService } from '../database/intelligence-prisma.service.js';
import { PricingPrismaService } from '../database/pricing-prisma.service.js';
import { QueueMetricsService } from '../observability/queue-metrics.service.js';
import { RedisService } from '../redis/redis.service.js';

export type DependencyStatus = 'up' | 'down';

export interface HealthReport {
  status: 'ok' | 'degraded';
  checks: Record<string, { status: DependencyStatus; error?: string }>;
  /** How much work is queued, per queue. Reported, never a reason to fail. */
  queues?: Record<string, { waiting: number; active: number; failed: number }>;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly core: CorePrismaService,
    private readonly pricing: PricingPrismaService,
    private readonly intelligence: IntelligencePrismaService,
    private readonly redis: RedisService,
    private readonly queues: QueueMetricsService,
  ) {}

  async check(): Promise<HealthReport> {
    const [coreDb, pricingDb, intelligenceDb, redis, queues] = await Promise.all([
      this.probe('core_db', () => this.core.$queryRaw`SELECT 1`),
      this.probe('pricing_db', () => this.pricing.$queryRaw`SELECT 1`),
      this.probe('intelligence_db', () => this.intelligence.$queryRaw`SELECT 1`),
      this.probe('redis', () => this.redis.ping()),
      this.queues.sample(),
    ]);

    const checks = {
      core_db: coreDb,
      pricing_db: pricingDb,
      intelligence_db: intelligenceDb,
      redis,
      // Workers reachable, which is a different question from Redis answering
      // a ping: a queue that cannot be read means jobs are not being drained.
      queues: { status: queues.status, error: queues.error },
    };

    const healthy = Object.values(checks).every(
      (check) => check.status === 'up',
    );

    return {
      status: healthy ? 'ok' : 'degraded',
      checks,
      queues: queues.queues,
    };
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
