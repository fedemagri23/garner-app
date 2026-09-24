import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { requestContext } from '../http/request-context.js';
import { MetricsService } from './metrics.service.js';
import type { RequestWithUser } from '../../security/presentation/current-user.decorator.js';

/**
 * Counts requests and times them, labelled by route *pattern* rather than
 * path: `/v1/products/:id` is one series, while one series per product id
 * would be an unbounded number of them and would take the metrics store down
 * with it.
 *
 * Also puts the authenticated account on the logging context, so every log
 * line written while serving a request says who it was for.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithUser>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();

    if (request.user?.id) {
      requestContext.set({ userId: request.user.id });
    }

    const labels = {
      method: request.method,
      route: routeOf(request),
    };

    const record = () => {
      const elapsed = Date.now() - startedAt;
      const status = response.statusCode;

      this.metrics.increment('garner_http_requests_total', {
        ...labels,
        status,
      });
      this.metrics.observe('garner_http_request_duration_ms', elapsed, labels);

      if (status >= 500) {
        this.metrics.increment('garner_http_server_errors_total', labels);
      }
    };

    return next.handle().pipe(
      tap({
        next: record,
        // A thrown error still produced a response; it should still be counted.
        error: record,
      }),
    );
  }
}

/** The matched route pattern, falling back to the path when none is known. */
function routeOf(request: Request): string {
  const route = (request as { route?: { path?: string } }).route;

  return route?.path ?? request.path;
}
