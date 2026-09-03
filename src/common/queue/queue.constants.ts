/** Queue names are shared constants so a producer and its worker cannot drift. */
export const QueueName = {
  System: 'system',
} as const;

export const SystemJob = {
  /**
   * A no-op round trip used to prove the worker path is alive end to end
   * (enqueue → worker → observable side effect). Real domain queues arrive
   * with the phases that need them.
   */
  Ping: 'ping',
} as const;

export interface SystemPingJobData {
  token: string;
}

/** Key the ping worker writes to, and the health self-test reads back. */
export function systemPingKey(token: string): string {
  return `system:ping:${token}`;
}
