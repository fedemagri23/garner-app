import { ConsoleLogger, type LoggerService } from '@nestjs/common';
import { requestContext } from '../http/request-context.js';

/**
 * One JSON object per line, carrying whatever the current context knows: the
 * request id, the trace the work belongs to, the account acting, and — inside
 * a worker — the job.
 *
 * Log aggregators index fields, not prose. A line that says which request,
 * trace and user it came from can be followed across the API and the workers
 * it queues; a pretty-printed sentence cannot.
 */
export class JsonLogger implements LoggerService {
  constructor(private readonly service = 'garner-api') {}

  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  error(message: unknown, stack?: string, context?: string): void {
    this.write('error', message, context, stack);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('verbose', message, context);
  }

  private write(
    level: string,
    message: unknown,
    context?: string,
    stack?: string,
  ): void {
    const current = requestContext.get();

    const line = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      context,
      message: typeof message === 'string' ? message : safeStringify(message),
      requestId: current?.requestId,
      traceId: current?.traceId,
      userId: current?.userId,
      jobId: current?.jobId,
      jobName: current?.jobName,
      stack,
    };

    const serialized = JSON.stringify(line, (_key, value: unknown) =>
      value === undefined ? undefined : value,
    );

    // stderr for anything a human should look at, stdout otherwise: the
    // conventional split, and what most process supervisors expect.
    if (level === 'error' || level === 'warn') {
      process.stderr.write(`${serialized}\n`);
    } else {
      process.stdout.write(`${serialized}\n`);
    }
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Readable colour in development, machine-readable JSON everywhere else.
 * Chosen once at startup rather than per call.
 */
export function createLogger(structured: boolean): LoggerService {
  return structured ? new JsonLogger() : new ConsoleLogger();
}
