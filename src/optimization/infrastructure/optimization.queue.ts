import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { RunOptimizationUseCase } from '../application/run-optimization.use-case.js';
import type { OptimizationJobs } from '../domain/optimization.repository.port.js';

export const OPTIMIZATION_QUEUE = 'optimization';

export const OptimizationJob = {
  Run: 'run-optimization',
} as const;

interface RunOptimizationData {
  requestId: string;
}

const ATTEMPTS = 3;

@Injectable()
export class BullmqOptimizationJobs implements OptimizationJobs {
  constructor(
    @InjectQueue(OPTIMIZATION_QUEUE)
    private readonly queue: Queue<RunOptimizationData>,
  ) {}

  async enqueue(requestId: string): Promise<void> {
    await this.queue.add(
      OptimizationJob.Run,
      { requestId },
      {
        jobId: `${OptimizationJob.Run}-${requestId}`,
        attempts: ATTEMPTS,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: true,
        removeOnFail: { age: 60 * 60 },
      },
    );
  }
}

/**
 * Runs optimizations off the request path, so a shopper never waits on a
 * combinatorial search and a slow one cannot occupy an HTTP worker.
 */
@Processor(OPTIMIZATION_QUEUE)
export class OptimizationProcessor extends WorkerHost {
  private readonly logger = new Logger(OptimizationProcessor.name);

  constructor(private readonly runOptimization: RunOptimizationUseCase) {
    super();
  }

  async process(job: Job<RunOptimizationData>): Promise<unknown> {
    if (job.name !== OptimizationJob.Run) {
      throw new Error(`Unsupported job "${job.name}" on ${OPTIMIZATION_QUEUE}`);
    }

    const { requestId } = job.data;

    try {
      const outcome = await this.runOptimization.execute(requestId);
      this.logger.debug(`Optimization ${requestId}: ${outcome.kind}`);
      return outcome;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // On the last attempt the request is marked failed, so the shopper is
      // told rather than left watching a spinner forever.
      if ((job.attemptsMade ?? 0) + 1 >= ATTEMPTS) {
        await this.runOptimization.giveUp(requestId, message);
      }

      throw error;
    }
  }
}
