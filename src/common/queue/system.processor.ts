import { JobObservability } from '../observability/job-observability.service.js';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { RedisService } from '../redis/redis.service.js';
import {
  QueueName,
  SystemJob,
  systemPingKey,
  type SystemPingJobData,
} from './queue.constants.js';

/**
 * Worker for the system queue.
 *
 * Like every job in this system it is idempotent: replaying the same ping
 * simply rewrites the same key with the same value.
 */
@Processor(QueueName.System)
export class SystemProcessor extends WorkerHost {
  private readonly logger = new Logger(SystemProcessor.name);

  constructor(private readonly redis: RedisService,
    private readonly observability: JobObservability,
  ) {
    super();
  }

  /** Every job runs inside its own log context, timed and counted. */
  async process(job: Job<SystemPingJobData>): Promise<{ handledAt: string }> {
    return this.observability.run(QueueName.System, job, () =>
      this.handle(job),
    );
  }

  private async handle(job: Job<SystemPingJobData>): Promise<{ handledAt: string }> {
    if (job.name !== SystemJob.Ping) {
      throw new Error(`Unsupported job "${job.name}" on ${QueueName.System}`);
    }

    const handledAt = new Date().toISOString();
    await this.redis.client.set(
      systemPingKey(job.data.token),
      handledAt,
      'EX',
      60,
    );

    this.logger.debug(`Handled ${SystemJob.Ping} for token ${job.data.token}`);
    return { handledAt };
  }
}
