import { Injectable, Logger } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { randomUUID } from 'node:crypto';
import type { Job } from 'bullmq';
import { requestContext } from '../http/request-context.js';
import { MetricsService } from './metrics.service.js';

/**
 * Wraps a job so it is as observable as a request: its logs carry the job's
 * id and name, and its outcome and duration are counted.
 *
 * The trace continues the producer's: BullMQ's telemetry carries the context
 * in the job and runs the processor inside a consumer span of the same trace,
 * so the work a request set off can be followed from that request. A job
 * nobody traced — a scheduled one — starts its own.
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

function traceOf(_job: Job): string {
  const span = trace.getActiveSpan()?.spanContext();

  return span && trace.isSpanContextValid(span) ? span.traceId : randomUUID();
}
