import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { RunSourceImportUseCase } from '../application/run-source-import.use-case.js';
import { ScheduleSourceImportsUseCase } from '../application/schedule-source-imports.use-case.js';
import type { ImportJobs } from '../domain/import-jobs.port.js';

export const EXTERNAL_IMPORTS_QUEUE = 'external-imports';

export const ExternalImportJob = {
  RunImport: 'run-source-import',
  ScheduleImports: 'schedule-source-imports',
} as const;

interface RunImportData {
  sourceId: string;
  runKey: string;
}

/** How often due sources are looked for. */
const SCHEDULE_EVERY_MS = 10 * 60 * 1000;

@Injectable()
export class BullmqImportJobs implements ImportJobs {
  constructor(
    @InjectQueue(EXTERNAL_IMPORTS_QUEUE)
    private readonly queue: Queue<RunImportData>,
  ) {}

  async enqueueImport(sourceId: string, runKey: string): Promise<void> {
    await this.queue.add(
      ExternalImportJob.RunImport,
      { sourceId, runKey },
      {
        // Keyed by source and slot, so the scheduler and an operator pressing
        // "import now" cannot start the same day's import twice.
        jobId: `${ExternalImportJob.RunImport}-${sourceId}-${runKey}`,
        // A source that is briefly down deserves a few tries; the run itself
        // is idempotent, so a retry resumes rather than repeats.
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: true,
        removeOnFail: { age: 24 * 60 * 60 },
      },
    );
  }
}

@Processor(EXTERNAL_IMPORTS_QUEUE)
export class ExternalImportsProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(ExternalImportsProcessor.name);

  constructor(
    private readonly runImport: RunSourceImportUseCase,
    private readonly schedule: ScheduleSourceImportsUseCase,
    @InjectQueue(EXTERNAL_IMPORTS_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      ExternalImportJob.ScheduleImports,
      { every: SCHEDULE_EVERY_MS },
      { name: ExternalImportJob.ScheduleImports },
    );
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case ExternalImportJob.RunImport: {
        const { sourceId, runKey } = job.data as RunImportData;
        const { status } = await this.runImport.execute(sourceId, runKey);

        this.logger.debug(`Import ${sourceId} (${runKey}): ${status}`);
        return { status };
      }

      case ExternalImportJob.ScheduleImports:
        return { queued: await this.schedule.execute() };

      default:
        throw new Error(
          `Unsupported job "${job.name}" on ${EXTERNAL_IMPORTS_QUEUE}`,
        );
    }
  }
}
