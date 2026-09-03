import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '../../common/config/app-config.service.js';
import type { AuthenticatedUser } from '../domain/authenticated-user.js';
import type { UserRole } from '../domain/user-role.js';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  /** Discriminates access tokens from any other JWT the system may issue. */
  typ: 'access';
}

/**
 * Issues and verifies short-lived access tokens. Refresh tokens are
 * deliberately not JWTs — they are opaque, stored hashed, and revocable, which
 * a stateless JWT cannot be.
 */
@Injectable()
export class AccessTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  async issue(user: AuthenticatedUser): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      typ: 'access',
    };

    return this.jwt.signAsync(payload, {
      secret: this.config.jwtSecret,
      expiresIn: this.config.jwtAccessTtlSeconds,
    });
  }

  async verify(token: string): Promise<AuthenticatedUser> {
    let payload: AccessTokenPayload;

    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.jwtSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    // A refresh-shaped or otherwise mistyped token must not authenticate a
    // request just because it was signed with the same secret.
    if (payload.typ !== 'access') {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
