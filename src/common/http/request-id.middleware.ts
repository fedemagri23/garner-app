import { Injectable, NestMiddleware } from '@nestjs/common';
import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { requestContext } from './request-context.js';

export const REQUEST_ID_HEADER = 'x-request-id';

/** The trace this request belongs to, echoed back so a client can quote it. */
export const TRACE_ID_HEADER = 'x-trace-id';

const tracer = trace.getTracer('garner-http');

/**
 * Opens the request's server span and its logging context.
 *
 * A caller already tracing sends W3C `traceparent`, and this request joins
 * that trace; otherwise a new one starts. Either way the trace id is real —
 * the same one an exported span carries, the one on every log line, and the
 * one the jobs this request queues continue — and it is echoed in
 * `x-trace-id`. A caller-supplied request id is kept, so one HTTP call can be
 * found from the client's side too.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = readHeader(req, REQUEST_ID_HEADER) ?? randomUUID();

    const parent = propagation.extract(context.active(), req.headers);
    const span = tracer.startSpan(
      req.method,
      {
        kind: SpanKind.SERVER,
        attributes: {
          'http.request.method': req.method,
          'url.path': req.path,
          'http.request.id': requestId,
        },
      },
      parent,
    );
    const traceId = span.spanContext().traceId;

    res.setHeader(REQUEST_ID_HEADER, requestId);
    res.setHeader(TRACE_ID_HEADER, traceId);

    res.on('finish', () => {
      span.setAttribute('http.response.status_code', res.statusCode);

      if (res.statusCode >= 500) {
        span.setStatus({ code: SpanStatusCode.ERROR });
      }

      span.end();
    });

    context.with(trace.setSpan(parent, span), () =>
      requestContext.run({ requestId, traceId }, () => next()),
    );
  }
}

function readHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  const first = Array.isArray(value) ? value[0] : value;

  return first?.trim() || undefined;
}
