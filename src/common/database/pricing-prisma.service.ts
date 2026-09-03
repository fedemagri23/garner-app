import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/pricing/index.js';
import { AppConfigService } from '../config/app-config.service.js';

/**
 * Client for `pricing_db` — raw price observations and ingestion metadata.
 * Populated from Phase 4 onward; wired here so the boundary (and the health
 * check) exists from the foundation.
 */
@Injectable()
export class PricingPrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PricingPrismaService.name);

  constructor(config: AppConfigService) {
    super({ adapter: new PrismaPg({ connectionString: config.pricingDbUrl }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to pricing_db');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
