import { BadGatewayException, Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import {
  DEVICE_TOKEN_REPOSITORY,
  PUSH_SENDER,
  type DeviceToken,
  type DeviceTokenRepository,
  type PushSender,
} from '../domain/notification.repository.port.js';

/** What the test push says, in the app's language. */
const TEST_PUSH = {
  title: 'Garner',
  body: 'Si ves esto, los avisos funcionan en este teléfono.',
};

/**
 * The phones a shopper wants to be reached on. Registering one is the consent
 * to push: no tokens, no push. Signing out forgets the phone, so the next
 * person to sign in on it is not sent the last one's messages.
 */
@Injectable()
export class ManageDevicesUseCase {
  constructor(
    @Inject(DEVICE_TOKEN_REPOSITORY) private readonly devices: DeviceTokenRepository,
    @Inject(PUSH_SENDER) private readonly push: PushSender,
  ) {}

  register(actor: AuthenticatedUser, token: string, platform: string): Promise<DeviceToken> {
    return this.devices.upsert(actor.id, token, platform);
  }

  unregister(actor: AuthenticatedUser, token: string): Promise<void> {
    return this.devices.remove(actor.id, token);
  }

  /**
   * Sends a test message to every phone the shopper has registered, so they
   * can see push working without waiting for a price to move. Says how many
   * phones there were and how many took it.
   */
  async sendTest(actor: AuthenticatedUser): Promise<{ devices: number; delivered: number }> {
    const phones = await this.devices.findByUser(actor.id);

    if (phones.length === 0) {
      return { devices: 0, delivered: 0 };
    }

    let outcomes;
    try {
      outcomes = await this.push.send(
        phones.map((phone) => ({ to: phone.token, ...TEST_PUSH, data: { test: '1' } })),
      );
    } catch {
      throw new BadGatewayException('The push service could not be reached');
    }

    await this.devices.removeMany(
      outcomes.filter((outcome) => outcome.status === 'invalid').map((outcome) => outcome.token),
    );

    return {
      devices: phones.length,
      delivered: outcomes.filter((outcome) => outcome.status === 'ok').length,
    };
  }
}
