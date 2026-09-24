import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { MetricsService } from './metrics.service.js';

export interface QueueHealth {
  status: 'up' | 'down';
  queues: Record<string, { waiting: number; active: number; failed: number }>;
  error?: string;
}

/**
 * Reads how much work is queued and how much has failed.
 *
 * Registered queues hand themselves in at startup, so this knows every queue
 * without importing the modules that own them — the alternative would be a
 * list here that silently goes stale each time a phase adds a worker.
 */
@Injectable()
export class QueueMetricsService {
  private readonly logger = new Logger(QueueMetricsService.name);
  private readonly queues = new Map<string, Queue>();

  constructor(private readonly metrics: MetricsService) {}

  register(name: string, queue: Queue): void {
    this.queues.set(name, queue);
  }

  /** Records current depths as gauges. Called on scrape and on health checks. */
  async sample(): Promise<QueueHealth> {
    const queues: QueueHealth['queues'] = {};

    try {
      for (const [name, queue] of this.queues) {
        const counts = await queue.getJobCounts('waiting', 'active', 'failed');

        const waiting = counts.waiting ?? 0;
        const active = counts.active ?? 0;
        const failed = counts.failed ?? 0;

        queues[name] = { waiting, active, failed };

        this.metrics.setGauge('garner_queue_waiting', waiting, { queue: name });
        this.metrics.setGauge('garner_queue_active', active, { queue: name });
        this.metrics.setGauge('garner_queue_failed', failed, { queue: name });
      }

      return { status: 'up', queues };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Queue metrics unavailable: ${message}`);

      return { status: 'down', queues, error: message };
    }
  }

  get registeredQueues(): string[] {
    return [...this.queues.keys()].sort();
  }
}
