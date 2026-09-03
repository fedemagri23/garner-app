import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { RedisService } from '../redis/redis.service.js';
import {
  QueueName,
  SystemJob,
  systemPingKey,
  type SystemPingJobData,
} from './queue.constants.js';

@Injectable()
export class SystemQueueService {
  constructor(
    @InjectQueue(QueueName.System)
    private readonly queue: Queue<SystemPingJobData>,
    private readonly redis: RedisService,
  ) {}

  async enqueuePing(token: string = randomUUID()): Promise<string> {
    await this.queue.add(
      SystemJob.Ping,
      { token },
      {
        // The token is the job id, so a retried enqueue of the same ping
        // collapses into one job rather than queueing duplicates. BullMQ
        // reserves ':' in custom ids, hence the dash.
        jobId: `${SystemJob.Ping}-${token}`,
        removeOnComplete: true,
        removeOnFail: 50,
        attempts: 3,
        backoff: { type: 'exponential', delay: 250 },
      },
    );

    return token;
  }

  /** Reads back the side effect the worker writes; undefined until handled. */
  async readPingResult(token: string): Promise<string | null> {
    return this.redis.client.get(systemPingKey(token));
  }
}
