import { UnauthorizedException } from '@nestjs/common';
import type { PasswordHasher } from '../../security/domain/password-hasher.port.js';
import type { UserWithCredentials } from '../../users/domain/user.entity.js';
import type { UserRepository } from '../../users/domain/user.repository.port.js';
import type { IssueTokenPairService } from './issue-token-pair.service.js';
import { LoginUseCase } from './login.use-case.js';

/**
 * Business rules are tested against the ports, with no HTTP layer and no
 * database, so a rule change fails here rather than in a slow end-to-end run.
 */
describe('LoginUseCase', () => {
  const storedUser: UserWithCredentials = {
    id: 'user-1',
    email: 'shopper@example.com',
    displayName: 'Shopper',
    role: 'USER',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    passwordHash: 'stored-hash',
  };

  let users: jest.Mocked<UserRepository>;
  let hasher: jest.Mocked<PasswordHasher>;
  let issueTokens: jest.Mocked<Pick<IssueTokenPairService, 'issue'>>;
  let useCase: LoginUseCase;

  beforeEach(() => {
    users = {
      findById: jest.fn(),
      findByEmailWithCredentials: jest.fn(),
      create: jest.fn(),
    };
    hasher = { hash: jest.fn(), verify: jest.fn() };
    issueTokens = {
      issue: jest.fn().mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
      }),
    };

    useCase = new LoginUseCase(
      users,
      hasher,
      issueTokens as unknown as IssueTokenPairService,
    );
  });

  it('issues a token pair for valid credentials', async () => {
    users.findByEmailWithCredentials.mockResolvedValue(storedUser);
    hasher.verify.mockResolvedValue(true);

    await expect(
      useCase.execute({ email: storedUser.email, password: 'right' }),
    ).resolves.toEqual({ accessToken: 'access', refreshToken: 'refresh' });

    expect(issueTokens.issue).toHaveBeenCalledWith({
      id: 'user-1',
      email: 'shopper@example.com',
      role: 'USER',
    });
  });

  it('rejects a wrong password without issuing tokens', async () => {
    users.findByEmailWithCredentials.mockResolvedValue(storedUser);
    hasher.verify.mockResolvedValue(false);

    await expect(
      useCase.execute({ email: storedUser.email, password: 'wrong' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(issueTokens.issue).not.toHaveBeenCalled();
  });

  it('rejects a deactivated account even with the right password', async () => {
    users.findByEmailWithCredentials.mockResolvedValue({
      ...storedUser,
      isActive: false,
    });
    hasher.verify.mockResolvedValue(true);

    await expect(
      useCase.execute({ email: storedUser.email, password: 'right' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(issueTokens.issue).not.toHaveBeenCalled();
  });

  it('still hashes when the email is unknown, to keep timing uniform', async () => {
    users.findByEmailWithCredentials.mockResolvedValue(null);
    hasher.hash.mockResolvedValue('decoy-hash');
    hasher.verify.mockResolvedValue(false);

    await expect(
      useCase.execute({ email: 'nobody@example.com', password: 'whatever' }),
    ).rejects.toThrow(UnauthorizedException);

    // Without this the "no such user" path would return noticeably faster and
    // leak which emails are registered.
    expect(hasher.verify).toHaveBeenCalledWith('decoy-hash', 'whatever');
  });

  it('reports the same message for unknown email and wrong password', async () => {
    users.findByEmailWithCredentials.mockResolvedValue(null);
    hasher.hash.mockResolvedValue('decoy-hash');
    hasher.verify.mockResolvedValue(false);
    const unknownEmail = await useCase
      .execute({ email: 'nobody@example.com', password: 'x' })
      .catch((error: Error) => error.message);

    users.findByEmailWithCredentials.mockResolvedValue(storedUser);
    const wrongPassword = await useCase
      .execute({ email: storedUser.email, password: 'x' })
      .catch((error: Error) => error.message);

    expect(unknownEmail).toEqual(wrongPassword);
  });
});
