import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from '../domain/price-alert.entity.js';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_PREFERENCES_REPOSITORY,
  UNSUBSCRIBE_TOKENS,
  type NotificationChannel,
  type NotificationPreferencesRepository,
  type UnsubscribeTokens,
} from '../domain/notification.repository.port.js';

/** What a holder may change; the consent timestamps are set here, never sent. */
export type PreferencesUpdate = Partial<
  Omit<NotificationPreferences, 'userId' | 'emailOptedInAt' | 'emailOptedOutAt'>
>;

@Injectable()
export class NotificationPreferencesUseCase {
  private readonly logger = new Logger(NotificationPreferencesUseCase.name);

  constructor(
    @Inject(NOTIFICATION_PREFERENCES_REPOSITORY)
    private readonly preferences: NotificationPreferencesRepository,
    @Inject(NOTIFICATION_CHANNELS)
    private readonly channels: NotificationChannel[],
    @Inject(UNSUBSCRIBE_TOKENS) private readonly tokens: UnsubscribeTokens,
  ) {}

  /** Whether this deployment can send email at all. */
  get emailAvailable(): boolean {
    return this.channels.some((channel) => channel.name === 'email');
  }

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
    input: PreferencesUpdate,
    now: Date = new Date(),
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

    if (input.emailEnabled === true && !this.emailAvailable) {
      throw new UnprocessableEntityException(
        'Email notifications are not available on this server',
      );
    }

    const current = await this.get(actor.id);

    return this.preferences.save(actor.id, {
      ...input,
      ...this.consentChange(current, input.emailEnabled, now),
    });
  }

  /**
   * Turns email off for whoever the token was issued to. Answers the same
   * whether or not the token was genuine or the account still exists, so the
   * link cannot be used to probe for accounts.
   */
  async unsubscribeByToken(token: string, now: Date = new Date()): Promise<void> {
    const userId = this.tokens.verify(token);

    if (!userId) {
      return;
    }

    const current = await this.preferences.find(userId);

    if (!current?.emailEnabled) {
      return;
    }

    await this.preferences.save(userId, {
      emailEnabled: false,
      ...this.consentChange(current, false, now),
    });

    this.logger.log(
      JSON.stringify({ event: 'notification.email_unsubscribed', userId }),
    );
  }

  /** Stamps a change of mind, and only a change: repeating a choice is not one. */
  private consentChange(
    current: NotificationPreferences,
    emailEnabled: boolean | undefined,
    now: Date,
  ): Partial<NotificationPreferences> {
    if (emailEnabled === undefined || emailEnabled === current.emailEnabled) {
      return {};
    }

    return emailEnabled ? { emailOptedInAt: now } : { emailOptedOutAt: now };
  }
}
