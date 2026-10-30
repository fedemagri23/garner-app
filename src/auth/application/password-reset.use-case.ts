import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { EMAIL_SENDER, type EmailSender } from '../../common/email/email-sender.js';
import { AppConfigService } from '../../common/config/app-config.service.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../../security/domain/password-hasher.port.js';
import { USER_REPOSITORY, type UserRepository } from '../../users/domain/user.repository.port.js';
import {
  generateResetCode,
  hashResetCode,
  isResetCodeUsable,
  MAX_RESET_REQUESTS_PER_HOUR,
  PASSWORD_RESET_REPOSITORY,
  RESET_CODE_TTL_MS,
  resetEmail,
  type PasswordResetRepository,
} from '../domain/password-reset.js';
import { REFRESH_TOKEN_REPOSITORY, type RefreshTokenRepository } from '../domain/refresh-token.repository.port.js';

/** One answer for every way a code can be wrong, so guessing learns nothing. */
const INVALID = 'The code is wrong or has expired';

/**
 * "¿Olvidaste tu contraseña?": a six-digit code by email, then a new
 * password with it. Asking never says whether the email has an account.
 * A reset signs the account out everywhere.
 */
@Injectable()
export class PasswordResetUseCase {
  private readonly logger = new Logger(PasswordResetUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_RESET_REPOSITORY) private readonly codes: PasswordResetRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly sessions: RefreshTokenRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender | null,
    private readonly config: AppConfigService,
  ) {}

  async request(emailAddress: string, now: Date = new Date()): Promise<void> {
    const user = await this.users.findByEmailWithCredentials(emailAddress);
    if (!user || !user.isActive) return;

    const lastHour = await this.codes.countSince(user.id, new Date(now.getTime() - 3_600_000));
    if (lastHour >= MAX_RESET_REQUESTS_PER_HOUR) return;

    const code = generateResetCode();
    await this.codes.create({
      userId: user.id,
      codeHash: hashResetCode(code, user.id),
      expiresAt: new Date(now.getTime() + RESET_CODE_TTL_MS),
    });

    const message = resetEmail(user.locale, code);
    if (this.email) {
      await this.email.send({ to: user.email, ...message, headers: {} });
    } else if (this.config.nodeEnv !== 'production') {
      // No mail server in development: the code goes to the server's log.
      this.logger.warn(`No SMTP_URL set; password reset code for ${user.email}: ${code}`);
    } else {
      this.logger.error('A password reset was asked for, but no mail server is configured');
    }
  }

  async reset(emailAddress: string, code: string, newPassword: string, now: Date = new Date()): Promise<void> {
    const user = await this.users.findByEmailWithCredentials(emailAddress);
    const record = user ? await this.codes.latest(user.id) : null;
    if (!user || !record || !isResetCodeUsable(record, now)) {
      throw new BadRequestException(INVALID);
    }

    if (hashResetCode(code.trim(), user.id) !== record.codeHash) {
      await this.codes.recordFailedAttempt(record.id);
      throw new BadRequestException(INVALID);
    }

    await this.users.updatePasswordHash(user.id, await this.hasher.hash(newPassword));
    await this.codes.markUsed(record.id, now);
    // Whoever might have had the old password is signed out too.
    await this.sessions.endAllForUser(user.id);
  }
}
