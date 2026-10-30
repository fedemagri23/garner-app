import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { CorePrismaService } from '../src/common/database/core-prisma.service.js';
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

    it('keeps the app\'s language, Spanish until told otherwise', async () => {
      const me = () => request(app.getHttpServer()).get('/v1/users/me').set(auth(otherShopper)).expect(200);
      expect((await me()).body.locale).toBe('es');

      await request(app.getHttpServer()).patch('/v1/users/me').set(auth(otherShopper)).send({ locale: 'de' }).expect(200);
      expect((await me()).body.locale).toBe('de');

      await request(app.getHttpServer()).patch('/v1/users/me').set(auth(otherShopper)).send({ locale: 'fr' }).expect(400);
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

  describe('account security and deletion', () => {
    const http = () => request(app.getHttpServer());
    const signUp = async (prefix: string) => {
      const email = uniqueEmail(prefix);
      const pair = (
        await http().post('/v1/auth/register').send({ email, password: 'correct-horse-battery', displayName: 'Ana' }).expect(201)
      ).body as { accessToken: string; refreshToken: string };
      return { email, ...pair };
    };

    it('changes the password with the current one, signing out every other device', async () => {
      const ana = await signUp('change');
      await http()
        .post('/v1/auth/password')
        .set(auth(ana.accessToken))
        .send({ currentPassword: 'wrong-password-1', newPassword: 'a-new-password-1' })
        .expect(403);

      const fresh = await http()
        .post('/v1/auth/password')
        .set(auth(ana.accessToken))
        .send({ currentPassword: 'correct-horse-battery', newPassword: 'a-new-password-1' })
        .expect(200);
      expect(fresh.body.refreshToken).toEqual(expect.any(String));

      await http().post('/v1/auth/refresh').send({ refreshToken: ana.refreshToken }).expect(401);
      await http().post('/v1/auth/refresh').send({ refreshToken: fresh.body.refreshToken }).expect(200);
      await http().post('/v1/auth/login').send({ email: ana.email, password: 'a-new-password-1' }).expect(200);
    });

    it('signs out of every device', async () => {
      const ana = await signUp('everywhere');
      await http().post('/v1/auth/logout-all').set(auth(ana.accessToken)).expect(204);
      await http().post('/v1/auth/refresh').send({ refreshToken: ana.refreshToken }).expect(401);
    });

    it('deletes an account after the password, erasing its lists and keeping what it gave, anonymised', async () => {
      const ana = await signUp('delete');
      const core = app.get(CorePrismaService);
      const user = await core.user.findUniqueOrThrow({ where: { email: ana.email } });
      await http().post('/v1/shopping-lists').set(auth(ana.accessToken)).send({ name: 'Semana', currency: 'ARS' }).expect(201);

      await http().delete('/v1/users/me').set(auth(ana.accessToken)).send({ password: 'nope-nope-nope' }).expect(403);
      await http().delete('/v1/users/me').set(auth(ana.accessToken)).send({ password: 'correct-horse-battery' }).expect(204);

      expect(await core.shoppingList.count({ where: { ownerId: user.id } })).toBe(0);
      expect(await core.refreshToken.count({ where: { userId: user.id } })).toBe(0);
      const gone = await core.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(gone).toMatchObject({ isActive: false, displayName: 'Cuenta eliminada' });
      expect(gone.email).not.toBe(ana.email);
      expect(gone.deletedAt).not.toBeNull();

      await http().post('/v1/auth/login').send({ email: ana.email, password: 'correct-horse-battery' }).expect(401);
      // The email is free again.
      await http().post('/v1/auth/register').send({ email: ana.email, password: 'correct-horse-battery', displayName: 'Ana' }).expect(201);
    });

    it('offers a web page to delete an account without the app', async () => {
      const ana = await signUp('webdelete');
      const form = await http().get('/v1/account-deletion').expect(200);
      expect(form.text).toContain('<form method="post">');

      const wrong = await http().post('/v1/account-deletion').type('form').send({ email: ana.email, password: 'nope' }).expect(200);
      expect(wrong.text).toContain('No pudimos eliminarla');

      const done = await http()
        .post('/v1/account-deletion')
        .type('form')
        .send({ email: ana.email, password: 'correct-horse-battery' })
        .expect(200);
      expect(done.text).toContain('Cuenta eliminada');
      await http().post('/v1/auth/login').send({ email: ana.email, password: 'correct-horse-battery' }).expect(401);
    });
  });

  describe('terms and legal pages', () => {
    const http = () => request(app.getHttpServer());

    it('records the terms accepted at sign-up, and asks the others to accept them', async () => {
      const accepted = await http()
        .post('/v1/auth/register')
        .send({ email: uniqueEmail('terms'), password: 'correct-horse-battery', displayName: 'Ana', acceptTerms: true })
        .expect(201);
      const me = await http().get('/v1/users/me').set(auth(accepted.body.accessToken)).expect(200);
      expect(me.body).toMatchObject({ termsAccepted: true, currentTermsVersion: expect.any(String) });

      const notYet = await http()
        .post('/v1/auth/register')
        .send({ email: uniqueEmail('noterms'), password: 'correct-horse-battery', displayName: 'Ben' })
        .expect(201);
      expect((await http().get('/v1/users/me').set(auth(notYet.body.accessToken)).expect(200)).body.termsAccepted).toBe(false);
      const after = await http().post('/v1/users/me/terms').set(auth(notYet.body.accessToken)).expect(200);
      expect(after.body.termsAccepted).toBe(true);
    });

    it('serves the terms, privacy and credits pages in the language asked for', async () => {
      const terms = await http().get('/v1/legal/terms').query({ lang: 'de' }).expect(200);
      expect(terms.headers['content-type']).toContain('text/html');
      expect(terms.text).toContain('Nutzungsbedingungen');
      expect(terms.text).toContain('Entwurf');

      expect((await http().get('/v1/legal/privacy').expect(200)).text).toContain('Privacidad');
      expect((await http().get('/v1/legal/credits').query({ lang: 'en' }).expect(200)).text).toContain('Open Database License');
      await http().get('/v1/legal/cookies').expect(404);
    });
  });
});
