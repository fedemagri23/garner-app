import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { requestContext } from './request-context.js';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Accepted from a caller that is already tracing, so a trace spans systems. */
export const TRACE_ID_HEADER = 'x-trace-id';

/**
 * Accepts a caller-supplied request id so a trace can span the mobile client
 * and the API, and mints one otherwise. The id is echoed back on the response
 * and attached to every error body.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = readHeader(req, REQUEST_ID_HEADER) ?? randomUUID();
    // A trace defaults to the request it started with, so one is always
    // present and an untraced caller still gets a usable id.
    const traceId = readHeader(req, TRACE_ID_HEADER) ?? requestId;

    res.setHeader(REQUEST_ID_HEADER, requestId);
    res.setHeader(TRACE_ID_HEADER, traceId);

    requestContext.run({ requestId, traceId }, () => next());
  }
}

function readHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  const first = Array.isArray(value) ? value[0] : value;

  return first?.trim() || undefined;
}
