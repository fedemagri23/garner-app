import { generateResetCode, hashResetCode, isResetCodeUsable, resetEmail, type ResetCodeRecord } from './password-reset.js';

const now = new Date('2026-10-30T10:00:00Z');
const record = (overrides: Partial<ResetCodeRecord> = {}): ResetCodeRecord => ({
  id: 'r1',
  userId: 'u1',
  codeHash: 'h',
  expiresAt: new Date(now.getTime() + 60_000),
  usedAt: null,
  attempts: 0,
  ...overrides,
});

it('makes six-digit codes', () => {
  for (let i = 0; i < 50; i += 1) expect(generateResetCode()).toMatch(/^\d{6}$/);
});

it('binds a code to its account', () => {
  expect(hashResetCode('123456', 'u1')).not.toBe(hashResetCode('123456', 'u2'));
  expect(hashResetCode('123456', 'u1')).toBe(hashResetCode('123456', 'u1'));
});

it('lets a code be tried only while fresh, unused and not guessed at too often', () => {
  expect(isResetCodeUsable(record(), now)).toBe(true);
  expect(isResetCodeUsable(record({ expiresAt: now }), now)).toBe(false);
  expect(isResetCodeUsable(record({ usedAt: now }), now)).toBe(false);
  expect(isResetCodeUsable(record({ attempts: 5 }), now)).toBe(false);
});

it('writes the email in the account’s language', () => {
  expect(resetEmail('es', '042137').text).toContain('Tu código es 042137.');
  expect(resetEmail('de', '042137').subject).toContain('Passwort');
});
