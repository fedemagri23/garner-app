import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp, resetDatabase, uniqueEmail } from './helpers/test-app.js';

interface TokenPair {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  const register = async (
    email: string,
    password = 'correct-horse-battery',
  ): Promise<TokenPair> => {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password, displayName: 'Test Shopper' })
      .expect(201);

    return response.body as TokenPair;
  };

  beforeAll(async () => {
    app = (await createTestApp()) as INestApplication<App>;
    await resetDatabase(app);
  });

  afterAll(async () => {
    await resetDatabase(app);
    await app.close();
  });

  describe('registration', () => {
    it('creates an account and returns a token pair', async () => {
      const tokens = await register(uniqueEmail('register'));

      expect(tokens.accessToken).toEqual(expect.any(String));
      expect(tokens.refreshToken).toEqual(expect.any(String));
      // Says when to refresh, so a client need not decode the token.
      expect(tokens.accessTokenExpiresIn).toBe(900);
    });

    it('rejects a duplicate email with 409', async () => {
      const email = uniqueEmail('duplicate');
      await register(email);

      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({ email, password: 'correct-horse-battery', displayName: 'Again' })
        .expect(409);
    });

    it('treats email as case-insensitive when detecting duplicates', async () => {
      const email = uniqueEmail('CaseTest');
      await register(email.toLowerCase());

      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: email.toUpperCase(),
          password: 'correct-horse-battery',
          displayName: 'Shouty',
        })
        .expect(409);
    });

    it('rejects invalid input with a 400 listing each problem', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({ email: 'not-an-email', password: 'short', displayName: '' })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('email')]),
      );
    });

    it('rejects unknown properties rather than silently dropping them', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: uniqueEmail('extra'),
          password: 'correct-horse-battery',
          displayName: 'Test',
          role: 'ADMIN',
        })
        .expect(400);
    });

    it('never returns the password hash', async () => {
      const email = uniqueEmail('nohash');
      const tokens = await register(email);

      const profile = await request(app.getHttpServer())
        .get('/v1/users/me')
        .set('authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);

      expect(profile.body).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(profile.body)).not.toContain('argon2');
    });
  });

  describe('login', () => {
    it('exchanges valid credentials for a token pair', async () => {
      const email = uniqueEmail('login');
      await register(email);

      const response = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password: 'correct-horse-battery' })
        .expect(200);

      expect(response.body.accessToken).toEqual(expect.any(String));
    });

    it('rejects a wrong password with 401', async () => {
      const email = uniqueEmail('wrongpass');
      await register(email);

      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password: 'definitely-not-it' })
        .expect(401);
    });

    it('gives the same answer for an unknown email as for a wrong password', async () => {
      const email = uniqueEmail('enumerate');
      await register(email);

      const wrongPassword = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password: 'definitely-not-it' })
        .expect(401);

      const unknownEmail = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: uniqueEmail('ghost'), password: 'definitely-not-it' })
        .expect(401);

      // Differing messages would let an attacker enumerate registered accounts.
      expect(unknownEmail.body.message).toEqual(wrongPassword.body.message);
    });
  });

  describe('protected routes', () => {
    it('returns the profile for a valid access token', async () => {
      const email = uniqueEmail('profile');
      const tokens = await register(email);

      const response = await request(app.getHttpServer())
        .get('/v1/users/me')
        .set('authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        email: email.toLowerCase(),
        displayName: 'Test Shopper',
        role: 'USER',
        isActive: true,
      });
    });

    it('rejects a request with no token', async () => {
      await request(app.getHttpServer()).get('/v1/users/me').expect(401);
    });

    it('rejects a malformed token', async () => {
      await request(app.getHttpServer())
        .get('/v1/users/me')
        .set('authorization', 'Bearer not-a-real-jwt')
        .expect(401);
    });

    it('rejects a token sent without the Bearer scheme', async () => {
      const tokens = await register(uniqueEmail('scheme'));

      await request(app.getHttpServer())
        .get('/v1/users/me')
        .set('authorization', tokens.accessToken)
        .expect(401);
    });

    it('rejects a refresh token used as an access token', async () => {
      const tokens = await register(uniqueEmail('wrongtokentype'));

      await request(app.getHttpServer())
        .get('/v1/users/me')
        .set('authorization', `Bearer ${tokens.refreshToken}`)
        .expect(401);
    });

    it('returns errors in the shared error shape', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/users/me')
        .expect(401);

      expect(response.body).toMatchObject({
        statusCode: 401,
        error: 'Unauthorized',
        path: '/v1/users/me',
        requestId: expect.any(String),
        timestamp: expect.any(String),
      });
    });
  });

  describe('refresh token rotation', () => {
    it('exchanges a refresh token for a new pair', async () => {
      const tokens = await register(uniqueEmail('rotate'));

      const response = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(200);

      expect(response.body.refreshToken).not.toEqual(tokens.refreshToken);
    });

    it('invalidates the old refresh token once rotated', async () => {
      const tokens = await register(uniqueEmail('rotate-once'));

      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(200);

      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);
    });

    it('revokes the whole session family when a rotated token is replayed', async () => {
      const tokens = await register(uniqueEmail('reuse'));

      const rotated = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(200);

      // Replaying the consumed token signals theft, so even the legitimate
      // successor must stop working.
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);

      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: (rotated.body as TokenPair).refreshToken })
        .expect(401);
    });

    it('rejects an unknown refresh token', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: 'never-issued-by-us' })
        .expect(401);
    });
  });

  describe('logout', () => {
    it('revokes the refresh token', async () => {
      const tokens = await register(uniqueEmail('logout'));

      await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .send({ refreshToken: tokens.refreshToken })
        .expect(204);

      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);
    });

    it('is idempotent for an unknown token', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .send({ refreshToken: 'never-issued-by-us' })
        .expect(204);
    });
  });

  describe('browser clients', () => {
    it('lets a configured origin call the API, and read the correlation ids', async () => {
      const preflight = await request(app.getHttpServer())
        .options('/v1/auth/login')
        .set('origin', 'http://localhost:8081')
        .set('access-control-request-method', 'POST')
        .set('access-control-request-headers', 'content-type,authorization');

      expect(preflight.status).toBeLessThan(300);
      expect(preflight.headers['access-control-allow-origin']).toBe('http://localhost:8081');

      const response = await request(app.getHttpServer())
        .get('/v1/health/live')
        .set('origin', 'http://localhost:8081')
        .expect(200);
      expect(response.headers['access-control-expose-headers']).toContain('x-trace-id');
    });

    it('gives any other origin no CORS permission', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/health/live')
        .set('origin', 'https://evil.example')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('password reset', () => {
    const MAILPIT = 'http://127.0.0.1:8025/api/v1';
    const http = () => request(app.getHttpServer());

    /** The six-digit code in the newest email to this address, as a person reads it. */
    const codeSentTo = async (address: string): Promise<string | null> => {
      const { messages } = (await (await fetch(`${MAILPIT}/messages?limit=50`)).json()) as {
        messages: { ID: string; To: { Address: string }[] }[];
      };
      const mail = messages.find((m) => m.To.some((to) => to.Address === address));
      if (!mail) return null;
      const { Text } = (await (await fetch(`${MAILPIT}/message/${mail.ID}`)).json()) as { Text: string };
      return /\b(\d{6})\b/.exec(Text)?.[1] ?? null;
    };

    it('emails a code, and the code sets a new password and signs out every device', async () => {
      const email = uniqueEmail('reset');
      const before = await register(email);

      await http().post('/v1/auth/password-reset').send({ email }).expect(202);
      const code = await codeSentTo(email);
      expect(code).toMatch(/^\d{6}$/);

      await http()
        .post('/v1/auth/password-reset/confirm')
        .send({ email, code, newPassword: 'a-brand-new-password' })
        .expect(204);

      await http().post('/v1/auth/login').send({ email, password: 'correct-horse-battery' }).expect(401);
      await http().post('/v1/auth/login').send({ email, password: 'a-brand-new-password' }).expect(200);
      await http().post('/v1/auth/refresh').send({ refreshToken: before.refreshToken }).expect(401);

      // Used once, it does not work again.
      await http()
        .post('/v1/auth/password-reset/confirm')
        .send({ email, code, newPassword: 'yet-another-password' })
        .expect(400);
    });

    it('answers the same for an email with no account, and sends nothing', async () => {
      const email = uniqueEmail('nobody');
      await http().post('/v1/auth/password-reset').send({ email }).expect(202);
      expect(await codeSentTo(email)).toBeNull();
    });

    it('kills a code after five wrong guesses', async () => {
      const email = uniqueEmail('guess');
      await register(email);
      await http().post('/v1/auth/password-reset').send({ email }).expect(202);
      const code = await codeSentTo(email);
      const wrong = code === '000000' ? '111111' : '000000';

      for (let i = 0; i < 5; i += 1) {
        await http().post('/v1/auth/password-reset/confirm').send({ email, code: wrong, newPassword: 'whatever-long-1' }).expect(400);
      }
      await http().post('/v1/auth/password-reset/confirm').send({ email, code, newPassword: 'whatever-long-1' }).expect(400);
    });

    it('sends at most three codes an hour to one account', async () => {
      const email = uniqueEmail('flood');
      await register(email);
      for (let i = 0; i < 4; i += 1) {
        await http().post('/v1/auth/password-reset').send({ email }).expect(202);
      }
      const { messages } = (await (await fetch(`${MAILPIT}/messages?limit=100`)).json()) as {
        messages: { To: { Address: string }[] }[];
      };
      expect(messages.filter((m) => m.To.some((to) => to.Address === email))).toHaveLength(3);
    });
  });
});
