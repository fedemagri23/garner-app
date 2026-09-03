import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/intelligence/index.js';
import { AppConfigService } from '../config/app-config.service.js';

/**
 * Client for `intelligence_db` — derived pricing data (weighted averages,
 * daily history, confidence). Populated from Phase 5 onward.
 */
@Injectable()
export class IntelligencePrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(IntelligencePrismaService.name);

  constructor(config: AppConfigService) {
    super({
      adapter: new PrismaPg({ connectionString: config.intelligenceDbUrl }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to intelligence_db');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
