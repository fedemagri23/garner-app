import { bullConnectionFrom } from './redis-connection.js';

describe('bullConnectionFrom', () => {
  it('keeps host, port and credentials', () => {
    expect(bullConnectionFrom('redis://user:p%40ss@cache.internal:6380')).toMatchObject({
      host: 'cache.internal',
      port: 6380,
      username: 'user',
      password: 'p@ss',
      maxRetriesPerRequest: null,
    });
  });

  it('keeps the database index, so deployments sharing a Redis stay apart', () => {
    expect(bullConnectionFrom('redis://localhost:6379/2')).toMatchObject({ db: 2 });
    expect(bullConnectionFrom('redis://localhost:6379')).toMatchObject({ db: 0 });
  });

  it('uses TLS for rediss://', () => {
    expect(bullConnectionFrom('rediss://cache.example.com:6380')).toMatchObject({ tls: {} });
    expect(bullConnectionFrom('redis://localhost')).not.toHaveProperty('tls');
  });

  it('refuses a database index that is not one', () => {
    expect(() => bullConnectionFrom('redis://localhost:6379/cache')).toThrow(/database index/);
  });
});
