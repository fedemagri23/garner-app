import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  createTestApp,
  registerWithRole,
  resetDatabase,
  uniqueEmail,
} from './helpers/test-app.js';

describe('User profile and preferences (e2e)', () => {
  let app: INestApplication<App>;
  let shopper: string;
  let otherShopper: string;

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  const register = async (prefix: string): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        email: uniqueEmail(prefix),
        password: 'correct-horse-battery',
        displayName: 'Shopper',
      })
      .expect(201);

    return response.body.accessToken;
  };

  beforeAll(async () => {
    app = (await createTestApp()) as INestApplication<App>;
    await resetDatabase(app);

    shopper = await register('prefs');
    otherShopper = await register('prefs-other');

    // Interests are validated against the catalog, so one has to exist.
    const curator = (await registerWithRole(app, 'MODERATOR')).accessToken;
    await request(app.getHttpServer())
      .post('/v1/categories')
      .set(auth(curator))
      .send({ name: 'Lácteos' })
      .expect(201);
  });

  afterAll(async () => {
    await resetDatabase(app);
    await app.close();
  });

  describe('profile', () => {
    it('updates the display name', async () => {
      const response = await request(app.getHttpServer())
        .patch('/v1/users/me')
        .set(auth(shopper))
        .send({ displayName: 'Federico' })
        .expect(200);

      expect(response.body.displayName).toBe('Federico');
    });

    it('refuses to change the email, which identifies the account', async () => {
      await request(app.getHttpServer())
        .patch('/v1/users/me')
        .set(auth(shopper))
        .send({ email: 'new@example.test' })
        .expect(400);
    });

    it('refuses a self-granted role', async () => {
      await request(app.getHttpServer())
        .patch('/v1/users/me')
        .set(auth(shopper))
        .send({ role: 'ADMIN' })
        .expect(400);
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer())
        .patch('/v1/users/me')
        .send({ displayName: 'Anonymous' })
        .expect(401);
    });
  });

  describe('preferences', () => {
    it('reads as defaults for a user who skipped onboarding', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/users/me/preferences')
        .set(auth(otherShopper))
        .expect(200);

      expect(response.body).toEqual({
        latitude: null,
        longitude: null,
        locationLabel: null,
        searchRadiusKm: 5,
        interests: [],
      });
    });

    it('saves a location and reads it back', async () => {
      await request(app.getHttpServer())
        .patch('/v1/users/me/preferences')
        .set(auth(shopper))
        .send({
          latitude: -34.6037,
          longitude: -58.3816,
          locationLabel: 'Casa',
          searchRadiusKm: 3,
        })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get('/v1/users/me/preferences')
        .set(auth(shopper))
        .expect(200);

      expect(response.body).toMatchObject({
        latitude: -34.6037,
        longitude: -58.3816,
        locationLabel: 'Casa',
        searchRadiusKm: 3,
      });
    });

    it('leaves untouched fields alone on a partial update', async () => {
      await request(app.getHttpServer())
        .patch('/v1/users/me/preferences')
        .set(auth(shopper))
        .send({ locationLabel: 'Trabajo' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get('/v1/users/me/preferences')
        .set(auth(shopper))
        .expect(200);

      expect(response.body).toMatchObject({
        locationLabel: 'Trabajo',
        latitude: -34.6037,
        searchRadiusKm: 3,
      });
    });

    it('rejects half a coordinate', async () => {
      await request(app.getHttpServer())
        .patch('/v1/users/me/preferences')
        .set(auth(otherShopper))
        .send({ latitude: -34.6037 })
        .expect(400);
    });

    it('accepts interests that name real categories', async () => {
      const response = await request(app.getHttpServer())
        .patch('/v1/users/me/preferences')
        .set(auth(shopper))
        .send({ interests: ['lacteos'] })
        .expect(200);

      expect(response.body.interests).toEqual(['lacteos']);
    });

    it('rejects an interest no category matches', async () => {
      await request(app.getHttpServer())
        .patch('/v1/users/me/preferences')
        .set(auth(shopper))
        .send({ interests: ['unicorns'] })
        .expect(400);
    });

    it('keeps one user’s preferences invisible to another', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/users/me/preferences')
        .set(auth(otherShopper))
        .expect(200);

      // The other shopper saved "Casa"/"Trabajo"; this account still has none.
      expect(response.body.locationLabel).toBeNull();
      expect(response.body.interests).toEqual([]);
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer())
        .get('/v1/users/me/preferences')
        .expect(401);
    });
  });
});
