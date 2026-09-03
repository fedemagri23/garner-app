import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp, resetDatabase, uniqueEmail } from './helpers/test-app.js';

interface TokenPair {
  accessToken: string;
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
});
