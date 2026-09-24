import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  /**
   * Spans the whole operation, including the background jobs it causes.
   * Where a request id identifies one HTTP call, a trace id follows the work
   * it sets off — which is what makes a job's logs findable from the request
   * that queued it.
   */
  traceId: string;
  /** Present once a guard has identified the caller. */
  userId?: string;
  /** Present inside a worker rather than a request. */
  jobId?: string;
  jobName?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Carries the request id down the call stack so logs written deep inside a use
 * case can be correlated without every function taking a context parameter.
 */
export const requestContext = {
  run<T>(context: RequestContext, callback: () => T): T {
    return storage.run(context, callback);
  },

  get(): RequestContext | undefined {
    return storage.getStore();
  },

  getRequestId(): string | undefined {
    return storage.getStore()?.requestId;
  },

  /** Attaches to the current context; does nothing outside one. */
  set(fields: Partial<RequestContext>): void {
    const current = storage.getStore();

    if (current) {
      Object.assign(current, fields);
    }
  },
};
