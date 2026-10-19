import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppConfigService } from '../../common/config/app-config.service.js';
import type { UnsubscribeTokens } from '../domain/notification.repository.port.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * `<user id>.<HMAC of it>`. The purpose is mixed into the MAC, so a token
 * minted here can never be mistaken for any other signed value, and rotating
 * JWT_SECRET invalidates old links along with every session.
 */
@Injectable()
export class HmacUnsubscribeTokens implements UnsubscribeTokens {
  constructor(private readonly config: AppConfigService) {}

  issue(userId: string): string {
    return `${userId}.${this.mac(userId)}`;
  }

  verify(token: string): string | null {
    const [userId, signature, ...rest] = token.split('.');

    if (rest.length > 0 || !userId || !signature || !UUID.test(userId)) {
      return null;
    }

    const expected = Buffer.from(this.mac(userId));
    const given = Buffer.from(signature);

    return given.length === expected.length && timingSafeEqual(given, expected)
      ? userId
      : null;
  }

  private mac(userId: string): string {
    return createHmac('sha256', this.config.jwtSecret)
      .update(`email-unsubscribe:${userId}`)
      .digest('base64url');
  }
}
