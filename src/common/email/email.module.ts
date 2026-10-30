import { Global, Module } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service.js';
import { EMAIL_SENDER } from './email-sender.js';
import { SmtpEmailSender } from './smtp-email-sender.js';

/**
 * The mail server, shared by everything that emails people: alert emails,
 * password resets. Null when `SMTP_URL` is unset; each caller decides what
 * that means for it.
 */
@Global()
@Module({
  providers: [
    {
      provide: EMAIL_SENDER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        config.smtpUrl ? new SmtpEmailSender(config.smtpUrl, config.emailFrom) : null,
    },
  ],
  exports: [EMAIL_SENDER],
})
export class EmailModule {}
