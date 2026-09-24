import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../security/domain/user-role.js';
import { Roles } from '../../security/presentation/roles.decorator.js';
import { RolesGuard } from '../../security/presentation/roles.guard.js';
import { SkipRateLimit } from '../../security/presentation/rate-limit.decorator.js';
import { QueueMetricsService } from './queue-metrics.service.js';
import { MetricsService } from './metrics.service.js';

/**
 * Prometheus scrape endpoint.
 *
 * Administrator-only rather than public: request paths, queue depths and error
 * counts describe the system's shape and its load, which is not something to
 * hand to anyone who asks. Scrapers authenticate with a token like any other
 * client. Exempt from rate limiting, since a scraper polls by design.
 */
@ApiTags('observability')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.Admin)
@SkipRateLimit()
@Controller({ path: 'metrics', version: '1' })
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly queues: QueueMetricsService,
  ) {}

  @Get()
  @Header('content-type', 'text/plain; version=0.0.4')
  @ApiOperation({ summary: 'Metrics in Prometheus exposition format' })
  @ApiOkResponse({ description: 'text/plain metrics' })
  async scrape(): Promise<string> {
    // Queue depths are read at scrape time; counting them continuously would
    // mean polling Redis for numbers nobody is looking at.
    await this.queues.sample();

    return this.metrics.render();
  }
}
