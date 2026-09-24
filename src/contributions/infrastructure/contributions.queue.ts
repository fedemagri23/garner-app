import { QueueMetricsService } from '../../common/observability/queue-metrics.service.js';
import { JobObservability } from '../../common/observability/job-observability.service.js';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { ReconcileSessionContributionsUseCase } from '../application/reconcile-session-contributions.use-case.js';
import { RecordSessionPurchasesUseCase } from '../application/record-session-purchases.use-case.js';
import type { ContributionJobs } from '../domain/session-contribution.port.js';

export const CONTRIBUTIONS_QUEUE = 'contributions';

export const ContributionJob = {
  RecordSessionPurchases: 'record-session-purchases',
  ReconcileSessions: 'reconcile-sessions',
} as const;

interface RecordSessionPurchasesData {
  sessionId: string;
}

const RECONCILE_EVERY_MS = 10 * 60 * 1000;

@Injectable()
export class BullmqContributionJobs implements ContributionJobs {
  constructor(
    @InjectQueue(CONTRIBUTIONS_QUEUE)
    private readonly queue: Queue<RecordSessionPurchasesData>,
  ) {}

  async enqueueSessionPurchases(sessionId: string): Promise<void> {
    await this.queue.add(
      ContributionJob.RecordSessionPurchases,
      { sessionId },
      {
        // One queued job per trip: the completion event and the sweep can
        // both enqueue the same trip without it running twice at once.
        jobId: `${ContributionJob.RecordSessionPurchases}-${sessionId}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: true,
        // Kept an hour for inspection, then released so the sweep can queue
        // the trip again if it still has no ledger entry.
        removeOnFail: { age: 60 * 60 },
      },
    );
  }
}

@Processor(CONTRIBUTIONS_QUEUE)
export class ContributionsProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(ContributionsProcessor.name);

  constructor(
    private readonly recordPurchases: RecordSessionPurchasesUseCase,
    private readonly reconcile: ReconcileSessionContributionsUseCase,
    @InjectQueue(CONTRIBUTIONS_QUEUE) private readonly queue: Queue,
    private readonly observability: JobObservability,
    private readonly queueMetrics: QueueMetricsService,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    // Queues hand themselves in, so queue depth is observable without a list
    // here that goes stale each time a phase adds a worker.
    this.queueMetrics.register(CONTRIBUTIONS_QUEUE, this.queue);

    await this.queue.upsertJobScheduler(
      ContributionJob.ReconcileSessions,
      { every: RECONCILE_EVERY_MS },
      { name: ContributionJob.ReconcileSessions },
    );
  }

  /** Every job runs inside its own log context, timed and counted. */
  async process(job: Job): Promise<unknown> {
    return this.observability.run(CONTRIBUTIONS_QUEUE, job, () =>
      this.handle(job),
    );
  }

  private async handle(job: Job): Promise<unknown> {
    switch (job.name) {
      case ContributionJob.RecordSessionPurchases: {
        const { sessionId } = job.data as RecordSessionPurchasesData;
        const outcome = await this.recordPurchases.execute(sessionId);
        this.logger.debug(`Session ${sessionId}: ${JSON.stringify(outcome)}`);
        return outcome;
      }

      case ContributionJob.ReconcileSessions:
        return { queued: await this.reconcile.execute() };

      default:
        throw new Error(`Unsupported job "${job.name}" on ${CONTRIBUTIONS_QUEUE}`);
    }
  }
}
