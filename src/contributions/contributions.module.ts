import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module.js';
import { ShoppingSessionsModule } from '../shopping-sessions/shopping-sessions.module.js';
import { ListMyContributionsUseCase } from './application/list-my-contributions.use-case.js';
import { ReconcileSessionContributionsUseCase } from './application/reconcile-session-contributions.use-case.js';
import { RecordSessionPurchasesUseCase } from './application/record-session-purchases.use-case.js';
import { ReportPriceUseCase } from './application/report-price.use-case.js';
import { SessionCompletedListener } from './application/session-completed.listener.js';
import {
  EVIDENCE_STORAGE,
  EVIDENCE_UPLOAD_QUOTA,
} from './domain/evidence-storage.port.js';
import {
  CONTRIBUTION_JOBS,
  SESSION_CONTRIBUTION_LEDGER,
} from './domain/session-contribution.port.js';
import {
  BullmqContributionJobs,
  CONTRIBUTIONS_QUEUE,
  ContributionsProcessor,
} from './infrastructure/contributions.queue.js';
import { LocalDiskEvidenceStorage } from './infrastructure/local-disk-evidence-storage.js';
import { PrismaSessionContributionLedger } from './infrastructure/prisma-session-contribution-ledger.js';
import { RedisEvidenceUploadQuota } from './infrastructure/redis-evidence-upload-quota.js';
import { ContributionsController } from './presentation/contributions.controller.js';

/**
 * How people contribute prices: by reporting one they saw, or — preferred —
 * simply by completing a shopping trip. Both feed pricing's single ingestion
 * pipeline; this module never writes observations itself.
 */
@Module({
  imports: [
    PricingModule,
    ShoppingSessionsModule,
    BullModule.registerQueue({ name: CONTRIBUTIONS_QUEUE }),
  ],
  controllers: [ContributionsController],
  providers: [
    ReportPriceUseCase,
    ListMyContributionsUseCase,
    RecordSessionPurchasesUseCase,
    ReconcileSessionContributionsUseCase,
    SessionCompletedListener,
    ContributionsProcessor,
    { provide: EVIDENCE_STORAGE, useClass: LocalDiskEvidenceStorage },
    { provide: EVIDENCE_UPLOAD_QUOTA, useClass: RedisEvidenceUploadQuota },
    {
      provide: SESSION_CONTRIBUTION_LEDGER,
      useClass: PrismaSessionContributionLedger,
    },
    { provide: CONTRIBUTION_JOBS, useClass: BullmqContributionJobs },
  ],
})
export class ContributionsModule {}
