import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from '../domain/price-alert.entity.js';
import {
  NOTIFICATION_PREFERENCES_REPOSITORY,
  type NotificationPreferencesRepository,
} from '../domain/notification.repository.port.js';

@Injectable()
export class NotificationPreferencesUseCase {
  constructor(
    @Inject(NOTIFICATION_PREFERENCES_REPOSITORY)
    private readonly preferences: NotificationPreferencesRepository,
  ) {}

  async get(userId: string): Promise<NotificationPreferences> {
    return (
      (await this.preferences.find(userId)) ?? {
        userId,
        ...DEFAULT_NOTIFICATION_PREFERENCES,
      }
    );
  }

  async update(
    actor: AuthenticatedUser,
    input: Partial<Omit<NotificationPreferences, 'userId'>>,
  ): Promise<NotificationPreferences> {
    const { quietHoursStartUtc: start, quietHoursEndUtc: end } = input;

    // Half a quiet period cannot be interpreted: silence from 22:00 until
    // when? Both or neither.
    if ((start === undefined) !== (end === undefined)) {
      throw new BadRequestException(
        'quietHoursStartUtc and quietHoursEndUtc must be set together',
      );
    }

    if (start !== undefined && end !== undefined && start !== null && end !== null && start === end) {
      throw new BadRequestException(
        'A quiet period that starts and ends at the same hour is empty',
      );
    }

    return this.preferences.save(actor.id, input);
  }
}
