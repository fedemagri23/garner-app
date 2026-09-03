import { Global, Module } from '@nestjs/common';
import { CorePrismaService } from './core-prisma.service.js';
import { IntelligencePrismaService } from './intelligence-prisma.service.js';
import { PricingPrismaService } from './pricing-prisma.service.js';

/**
 * The three logical databases are kept as separate clients on purpose: there
 * are no cross-database foreign keys and no distributed transactions. Effects
 * that must cross a boundary travel as domain events.
 */
@Global()
@Module({
  providers: [CorePrismaService, PricingPrismaService, IntelligencePrismaService],
  exports: [CorePrismaService, PricingPrismaService, IntelligencePrismaService],
})
export class DatabaseModule {}
