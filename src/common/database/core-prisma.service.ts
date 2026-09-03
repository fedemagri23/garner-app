import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/core/index.js';
import { AppConfigService } from '../config/app-config.service.js';

/**
 * Client for `core_db` — transactional data (identity, catalog, lists,
 * sessions). Only repositories inside the module that owns a table may use
 * this; cross-module reads go through that module's repository port.
 */
@Injectable()
export class CorePrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CorePrismaService.name);

  constructor(config: AppConfigService) {
    super({ adapter: new PrismaPg({ connectionString: config.coreDbUrl }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to core_db');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
