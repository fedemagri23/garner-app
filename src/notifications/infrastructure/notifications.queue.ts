import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { AppConfigService } from '../../common/config/app-config.service.js';
import { DeliverNotificationUseCase } from '../application/deliver-notification.use-case.js';
import { EvaluatePriceAlertsUseCase } from '../application/evaluate-price-alerts.use-case.js';
import {
  NOTIFICATION_REPOSITORY,
  type NotificationJobs,
  type NotificationRepository,
} from '../domain/notification.repository.port.js';
import { Inject } from '@nestjs/common';

export const NOTIFICATIONS_QUEUE = 'notifications';

export const NotificationJob = {
  EvaluateAlerts: 'evaluate-alerts',
  Deliver: 'deliver-notification',
  /** Catches held and missed messages, and prunes delivered ones. */
  Sweep: 'notification-sweep',
} as const;

interface EvaluateAlertsData {
  productId: string;
  storeId: string;
  priceCents: number;
  previousPriceCents: number | null;
}

interface DeliverData {
  notificationId: string;
}

const SWEEP_EVERY_MS = 5 * 60 * 1000;
const RETENTION_BATCH = 5_000;

@Injectable()
export class BullmqNotificationJobs implements NotificationJobs {
  constructor(
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue,
  ) {}

  async enqueueEvaluation(input: EvaluateAlertsData): Promise<void> {
    await this.queue.add(NotificationJob.EvaluateAlerts, input, {
      // Keyed by the price itself: the same change evaluated twice raises the
      // same message, and the dedupe key would collapse it anyway.
      jobId: `${NotificationJob.EvaluateAlerts}-${input.productId}-${input.storeId}-${input.priceCents}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: true,
      removeOnFail: { age: 60 * 60 },
    });
  }

  async enqueueDelivery(notificationId: string, deliverAt: Date): Promise<void> {
    await this.queue.add(
      NotificationJob.Deliver,
      { notificationId } satisfies DeliverData,
      {
        jobId: `${NotificationJob.Deliver}-${notificationId}`,
        // Quiet hours are honoured by waiting, not by dropping the message.
        delay: Math.max(0, deliverAt.getTime() - Date.now()),
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: { age: 24 * 60 * 60 },
      },
    );
  }
}

/**
 * Evaluation, delivery and the sweep that covers for both.
 *
 * Every job is safe to repeat: evaluation collapses on the notification's
 * dedupe key, delivery skips a message already sent, and the sweep only picks
 * up messages that are due and unsent.
 */
@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly evaluate: EvaluatePriceAlertsUseCase,
    private readonly deliver: DeliverNotificationUseCase,
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: NotificationRepository,
    private readonly config: AppConfigService,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      NotificationJob.Sweep,
      { every: SWEEP_EVERY_MS },
      { name: NotificationJob.Sweep },
    );
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case NotificationJob.EvaluateAlerts:
        return this.evaluate.execute(job.data as EvaluateAlertsData);

      case NotificationJob.Deliver: {
        const { notificationId } = job.data as DeliverData;
        return { sent: await this.deliver.execute(notificationId) };
      }

      case NotificationJob.Sweep: {
        const sent = await this.deliver.deliverDue();
        const pruned = await this.prune();

        if (sent > 0 || pruned > 0) {
          this.logger.log(
            `Notification sweep delivered ${sent} and pruned ${pruned}`,
          );
        }

        return { sent, pruned };
      }

      default:
        throw new Error(`Unsupported job "${job.name}" on ${NOTIFICATIONS_QUEUE}`);
    }
  }

  /** Delivered messages are history the client has already seen. */
  private async prune(): Promise<number> {
    const cutoff = new Date(
      Date.now() -
        this.config.notificationRetentionDays * 24 * 60 * 60 * 1000,
    );

    return this.notifications.deleteSentBefore(cutoff, RETENTION_BATCH);
  }
}
