import { UnprocessableEntityException } from '@nestjs/common';
import type {
  NotificationChannel,
  NotificationPreferencesRepository,
  UnsubscribeTokens,
} from '../domain/notification.repository.port.js';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from '../domain/price-alert.entity.js';
import { NotificationPreferencesUseCase } from './notification-preferences.use-case.js';

const now = new Date('2026-10-19T12:00:00Z');
const actor = { id: 'user-1', email: 'ana@example.com', role: 'USER' as const };

describe('NotificationPreferencesUseCase', () => {
  let stored: NotificationPreferences | null;
  let repository: { find: jest.Mock; save: jest.Mock };
  let tokens: jest.Mocked<UnsubscribeTokens>;

  const useCase = (channels: string[] = ['in-app', 'email']) =>
    new NotificationPreferencesUseCase(
      repository as unknown as NotificationPreferencesRepository,
      channels.map((name) => ({ name }) as NotificationChannel),
      tokens,
    );

  beforeEach(() => {
    stored = null;
    repository = {
      find: jest.fn(async () => stored),
      save: jest.fn(async (userId: string, input: Partial<NotificationPreferences>) => ({
        userId,
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        ...stored,
        ...input,
      })),
    };
    tokens = { issue: jest.fn(), verify: jest.fn().mockReturnValue('user-1') };
  });

  it('stamps consent when email is turned on', async () => {
    await useCase().update(actor, { emailEnabled: true }, now);

    expect(repository.save).toHaveBeenCalledWith('user-1', {
      emailEnabled: true,
      emailOptedInAt: now,
    });
  });

  it('stamps the withdrawal when email is turned off', async () => {
    stored = { userId: 'user-1', ...DEFAULT_NOTIFICATION_PREFERENCES, emailEnabled: true };

    await useCase().update(actor, { emailEnabled: false }, now);

    expect(repository.save).toHaveBeenCalledWith('user-1', {
      emailEnabled: false,
      emailOptedOutAt: now,
    });
  });

  it('does not restamp a choice that did not change', async () => {
    stored = { userId: 'user-1', ...DEFAULT_NOTIFICATION_PREFERENCES, emailEnabled: true };

    await useCase().update(actor, { emailEnabled: true }, now);

    expect(repository.save).toHaveBeenCalledWith('user-1', { emailEnabled: true });
  });

  it('refuses email on a server that cannot send it', async () => {
    await expect(useCase(['in-app']).update(actor, { emailEnabled: true })).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('turns email off from a genuine unsubscribe link', async () => {
    stored = { userId: 'user-1', ...DEFAULT_NOTIFICATION_PREFERENCES, emailEnabled: true };

    await useCase().unsubscribeByToken('token', now);

    expect(repository.save).toHaveBeenCalledWith('user-1', {
      emailEnabled: false,
      emailOptedOutAt: now,
    });
  });

  it('quietly ignores a forged link', async () => {
    tokens.verify.mockReturnValue(null);

    await expect(useCase().unsubscribeByToken('forged')).resolves.toBeUndefined();
    expect(repository.find).not.toHaveBeenCalled();
  });

  it('does nothing for someone already unsubscribed', async () => {
    stored = { userId: 'user-1', ...DEFAULT_NOTIFICATION_PREFERENCES, emailEnabled: false };

    await useCase().unsubscribeByToken('token', now);

    expect(repository.save).not.toHaveBeenCalled();
  });
});
