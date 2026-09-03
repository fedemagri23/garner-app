import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../security/presentation/public.decorator.js';
import { SkipRateLimit } from '../../security/presentation/rate-limit.decorator.js';
import { HealthService, type HealthReport } from './health.service.js';

@ApiTags('health')
@SkipRateLimit()
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * Readiness: reports on every backing dependency and answers 503 when any is
   * down, so an orchestrator stops routing traffic to an instance that cannot
   * serve requests.
   */
  @Public()
  @Get()
  @ApiOperation({ summary: 'Readiness probe covering all dependencies' })
  async readiness(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthReport> {
    const report = await this.health.check();

    res.status(
      report.status === 'ok'
        ? HttpStatus.OK
        : HttpStatus.SERVICE_UNAVAILABLE,
    );

    return report;
  }

  /**
   * Liveness: says only that the process is up. It must not touch
   * dependencies, or a database blip would get healthy instances restarted.
   */
  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
