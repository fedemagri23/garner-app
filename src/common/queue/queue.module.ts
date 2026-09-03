import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service.js';
import { QueueName } from './queue.constants.js';
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
        const url = new URL(config.redisUrl);
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            username: url.username || undefined,
            password: url.password || undefined,
            maxRetriesPerRequest: null,
          },
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
