import type { ConnectionOptions } from 'bullmq';

/**
 * BullMQ's connection, from the same `REDIS_URL` the cache uses.
 *
 * Built field by field because BullMQ needs `maxRetriesPerRequest: null`,
 * and everything in the URL has to survive the trip: the database index keeps
 * two deployments sharing one Redis from consuming each other's jobs, and
 * `rediss://` means TLS.
 */
export function bullConnectionFrom(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  const db = Number(url.pathname.replace(/^\//, '') || 0);

  if (!Number.isInteger(db) || db < 0) {
    throw new Error(`REDIS_URL names an invalid database index: ${url.pathname}`);
  }

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: decodeURIComponent(url.username) || undefined,
    password: decodeURIComponent(url.password) || undefined,
    db,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    // Blocking commands must wait indefinitely rather than fail.
    maxRetriesPerRequest: null,
  };
}
