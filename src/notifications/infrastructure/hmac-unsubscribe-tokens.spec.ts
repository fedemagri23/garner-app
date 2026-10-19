import type { AppConfigService } from '../../common/config/app-config.service.js';
import { HmacUnsubscribeTokens } from './hmac-unsubscribe-tokens.js';

const userId = '3f2b6c1e-8a4d-4c6b-9e2f-1a2b3c4d5e6f';

const tokens = (secret = 'a-secret-of-sufficient-length') =>
  new HmacUnsubscribeTokens({ jwtSecret: secret } as AppConfigService);

describe('HmacUnsubscribeTokens', () => {
  it('verifies a token it issued, back to the same user', () => {
    expect(tokens().verify(tokens().issue(userId))).toBe(userId);
  });

  it('refuses a token naming someone else under the same signature', () => {
    const [, signature] = tokens().issue(userId).split('.');
    const other = '00000000-0000-4000-8000-000000000000';

    expect(tokens().verify(`${other}.${signature}`)).toBeNull();
  });

  it('refuses a token signed with another secret', () => {
    expect(tokens().verify(tokens('a-different-secret-entirely').issue(userId))).toBeNull();
  });

  it.each(['', 'garbage', `${userId}`, `${userId}.`, `not-a-uuid.abc`, `${userId}.a.b`])(
    'refuses the malformed token %p',
    (token) => {
      expect(tokens().verify(token)).toBeNull();
    },
  );
});
