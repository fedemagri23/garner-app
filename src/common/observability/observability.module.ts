import { Global, Module } from '@nestjs/common';
import { JobObservability } from './job-observability.service.js';
import { MetricsService } from './metrics.service.js';
import { QueueMetricsService } from './queue-metrics.service.js';

/**
 * Global so any module can record a metric without importing infrastructure
 * from a sibling. The interceptor that times requests is registered in
 * AppModule, where the rest of the global pipeline lives.
 */
@Global()
@Module({
  providers: [MetricsService, QueueMetricsService, JobObservability],
  exports: [MetricsService, QueueMetricsService, JobObservability],
})
export class ObservabilityModule {}
