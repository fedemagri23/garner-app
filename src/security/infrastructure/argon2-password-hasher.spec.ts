import { Argon2PasswordHasher } from './argon2-password-hasher.js';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('verifies a password against its own hash', async () => {
    const hash = await hasher.hash('correct-horse-battery');
    await expect(hasher.verify(hash, 'correct-horse-battery')).resolves.toBe(
      true,
    );
  });

  it('rejects a wrong password', async () => {
    const hash = await hasher.hash('correct-horse-battery');
    await expect(hasher.verify(hash, 'not-the-password')).resolves.toBe(false);
  });

  it('produces a different hash for the same password each time', async () => {
    // Argon2 salts every hash, so identical passwords must not collide into
    // the same stored value.
    const [first, second] = await Promise.all([
      hasher.hash('same-password-twice'),
      hasher.hash('same-password-twice'),
    ]);

    expect(first).not.toEqual(second);
  });

  it('treats a malformed stored hash as a failed verification, not an error', async () => {
    await expect(hasher.verify('not-a-real-hash', 'anything')).resolves.toBe(
      false,
    );
  });

  it('encodes argon2id parameters in the hash', async () => {
    const hash = await hasher.hash('correct-horse-battery');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });
});
