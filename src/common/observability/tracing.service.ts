import {
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service.js';
import { startTracing, type Tracing } from './tracing.js';

/**
 * Owns the tracer provider for the life of the application. Started in the
 * constructor, before any request or job can run, and flushed on shutdown so
 * the last spans of a deploy are not lost.
 */
@Injectable()
export class TracingService implements OnApplicationShutdown {
  private readonly tracing: Tracing;

  constructor(config: AppConfigService) {
    this.tracing = startTracing(config.tracing);

    if (this.tracing.exporting) {
      new Logger(TracingService.name).log(
        `Exporting traces to ${config.tracing.otlpEndpoint} as ${config.tracing.serviceName}`,
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.tracing.shutdown();
  }
}
