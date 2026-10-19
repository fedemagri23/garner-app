import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { BullMQOtel } from 'bullmq-otel';
import { AppConfigService } from '../config/app-config.service.js';
import { QueueName } from './queue.constants.js';
import { bullConnectionFrom } from './redis-connection.js';
import { SystemQueueService } from './system-queue.service.js';
import { SystemProcessor } from './system.processor.js';

/**
 * BullMQ requires `maxRetriesPerRequest: null` on its connection: blocking
 * commands must wait indefinitely rather than fail, which is the opposite of
 * what the cache connection in RedisService wants. Hence separate connections.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => {
        return {
          connection: bullConnectionFrom(config.redisUrl),
          // Carries the trace context from whoever added a job into the
          // worker that runs it, for every queue and worker alike.
          telemetry: new BullMQOtel({ tracerName: 'garner-queues' }),
          defaultJobOptions: {
            removeOnComplete: 100,
            removeOnFail: 500,
          },
        };
      },
    }),
    BullModule.registerQueue({ name: QueueName.System }),
  ],
  providers: [SystemQueueService, SystemProcessor],
  exports: [SystemQueueService, BullModule],
})
export class QueueModule {}
