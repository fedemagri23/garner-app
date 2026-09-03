import type { AppConfigService } from '../../common/config/app-config.service.js';
import type { RedisService } from '../../common/redis/redis.service.js';
import { RedisRateLimiter } from './redis-rate-limiter.js';

describe('RedisRateLimiter', () => {
  const config = {
    rateLimitWindowMs: 60_000,
    rateLimitMax: 3,
  } as AppConfigService;

  /** Stands in for the Redis MULTI pipeline, returning a scripted INCR result. */
  const redisReturning = (count: number | Error): RedisService => {
    const exec =
      count instanceof Error
        ? jest.fn().mockRejectedValue(count)
        : jest.fn().mockResolvedValue([[null, count]]);

    const multi = {
      incr: jest.fn().mockReturnThis(),
      pexpire: jest.fn().mockReturnThis(),
      exec,
    };

    return {
      client: { multi: jest.fn().mockReturnValue(multi) },
    } as unknown as RedisService;
  };

  it('allows a request inside the limit', async () => {
    const limiter = new RedisRateLimiter(redisReturning(1), config);

    const decision = await limiter.hit('1.2.3.4');

    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(2);
  });

  it('allows the request that exactly reaches the limit', async () => {
    const limiter = new RedisRateLimiter(redisReturning(3), config);

    const decision = await limiter.hit('1.2.3.4');

    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(0);
  });

  it('blocks the first request past the limit', async () => {
    const limiter = new RedisRateLimiter(redisReturning(4), config);

    const decision = await limiter.hit('1.2.3.4');

    expect(decision.allowed).toBe(false);
    expect(decision.remaining).toBe(0);
  });

  it('reports a positive retry-after within the window', async () => {
    const limiter = new RedisRateLimiter(redisReturning(4), config);

    const decision = await limiter.hit('1.2.3.4');

    expect(decision.retryAfterSeconds).toBeGreaterThan(0);
    expect(decision.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('sets an expiry so counters cannot leak keys forever', async () => {
    const redis = redisReturning(1);
    const limiter = new RedisRateLimiter(redis, config);

    await limiter.hit('1.2.3.4');

    const multi = (redis.client.multi as jest.Mock).mock.results[0]
      .value as { pexpire: jest.Mock };
    expect(multi.pexpire).toHaveBeenCalledWith(expect.any(String), 60_000);
  });

  it('fails open when Redis is unavailable', async () => {
    const limiter = new RedisRateLimiter(
      redisReturning(new Error('redis down')),
      config,
    );

    // A rate limiter protects capacity; it does not authorize anyone. Failing
    // closed would turn a cache outage into a total outage.
    await expect(limiter.hit('1.2.3.4')).resolves.toMatchObject({
      allowed: true,
    });
  });

  it('keys separate identities into separate buckets', async () => {
    const redis = redisReturning(1);
    const limiter = new RedisRateLimiter(redis, config);
    const multi = (redis.client.multi as jest.Mock)() as { incr: jest.Mock };

    await limiter.hit('1.2.3.4');
    await limiter.hit('5.6.7.8');

    const [firstKey] = multi.incr.mock.calls[0] as [string];
    const [secondKey] = multi.incr.mock.calls[1] as [string];
    expect(firstKey).not.toEqual(secondKey);
  });
});
