import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Job } from 'bullmq';
import { requestContext } from '../http/request-context.js';
import { MetricsService } from './metrics.service.js';

/**
 * Wraps a job so it is as observable as a request: its logs carry the job's
 * id and name, and its outcome and duration are counted.
 *
 * The trace id travels in the job's own data when the producer put one there,
 * so the work a request set off can be followed from that request. Without one
 * the job starts its own trace rather than appearing in nobody's.
 */
@Injectable()
export class JobObservability {
  private readonly logger = new Logger('Job');

  constructor(private readonly metrics: MetricsService) {}

  async run<T>(
    queue: string,
    job: Job,
    handler: () => Promise<T>,
  ): Promise<T> {
    const traceId = traceOf(job);
    const jobId = job.id ?? randomUUID();
    const startedAt = Date.now();
    const labels = { queue, job: job.name };

    return requestContext.run(
      { requestId: jobId, traceId, jobId, jobName: job.name },
      async () => {
        try {
          const result = await handler();

          this.metrics.increment('garner_jobs_total', {
            ...labels,
            outcome: 'completed',
          });
          this.metrics.observe(
            'garner_job_duration_ms',
            Date.now() - startedAt,
            labels,
          );

          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);

          this.metrics.increment('garner_jobs_total', {
            ...labels,
            outcome: 'failed',
          });
          // Attempts already made, so a retry storm is visible as one.
          this.metrics.increment('garner_job_failures_total', {
            ...labels,
            attempt: (job.attemptsMade ?? 0) + 1,
          });

          this.logger.error(
            `Job ${job.name} on ${queue} failed: ${message}`,
            error instanceof Error ? error.stack : undefined,
          );

          throw error;
        }
      },
    );
  }
}

function traceOf(job: Job): string {
  const data = job.data as { traceId?: unknown } | undefined;

  return typeof data?.traceId === 'string' ? data.traceId : randomUUID();
}
