import { ManageDevicesUseCase } from './application/manage-devices.use-case.js';
import { PushChannel } from './infrastructure/push-channel.js';
import { ExpoPushSender } from './infrastructure/expo-push-sender.js';
import { PrismaDeviceTokenRepository } from './infrastructure/prisma-device-token.repository.js';
import { DevicesController } from './presentation/devices.controller.js';
import { SubjectNamesLoader } from './application/notification-names.js';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AppConfigService } from '../common/config/app-config.service.js';
import { PriceIntelligenceModule } from '../price-intelligence/price-intelligence.module.js';
import { ProductsModule } from '../products/products.module.js';
import { SupermarketsModule } from '../supermarkets/supermarkets.module.js';
import { UsersModule } from '../users/users.module.js';
import { DeliverNotificationUseCase } from './application/deliver-notification.use-case.js';
import { EvaluatePriceAlertsUseCase } from './application/evaluate-price-alerts.use-case.js';
import { ManagePriceAlertsUseCase } from './application/manage-price-alerts.use-case.js';
import { NotificationPreferencesUseCase } from './application/notification-preferences.use-case.js';
import { PriceUpdatedListener } from './application/price-updated.listener.js';
import { ReadNotificationsUseCase } from './application/read-notifications.use-case.js';
import {
  CHANNEL_DELIVERY_LEDGER,
  DEVICE_TOKEN_REPOSITORY,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_JOBS,
  NOTIFICATION_PREFERENCES_REPOSITORY,
  NOTIFICATION_REPOSITORY,
  PRICE_ALERT_REPOSITORY,
  PUSH_SENDER,
  UNSUBSCRIBE_TOKENS,
  type DeviceTokenRepository,
  type NotificationChannel,
  type PushSender,
  type UnsubscribeTokens,
} from './domain/notification.repository.port.js';
import { EmailChannel } from './infrastructure/email-channel.js';
import { HmacUnsubscribeTokens } from './infrastructure/hmac-unsubscribe-tokens.js';
import { InAppChannel } from './infrastructure/in-app-channel.js';
import { SmtpEmailSender } from './infrastructure/smtp-email-sender.js';
import {
  BullmqNotificationJobs,
  NOTIFICATIONS_QUEUE,
  NotificationsProcessor,
} from './infrastructure/notifications.queue.js';
import {
  PrismaChannelDeliveryLedger,
  PrismaNotificationPreferencesRepository,
  PrismaNotificationRepository,
  PrismaPriceAlertRepository,
} from './infrastructure/prisma-notification.repository.js';
import { EmailUnsubscribeController } from './presentation/email-unsubscribe.controller.js';
import { NotificationsController } from './presentation/notifications.controller.js';

/**
 * Price alerts and the messages they raise.
 *
 * Evaluation runs in a worker off DerivedPriceUpdated, so nobody submitting a
 * price waits on other people's alerts. Delivery fans out over channels: the
 * in-app inbox always, and email for those who opted in when a mail server is
 * configured. Push would be one more channel, not a change to any of this.
 */
@Module({
  imports: [
    ProductsModule,
    SupermarketsModule,
    PriceIntelligenceModule,
    UsersModule,
    BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE }),
  ],
  controllers: [NotificationsController, EmailUnsubscribeController, DevicesController],
  providers: [
    SubjectNamesLoader,
    ManageDevicesUseCase,
    ManagePriceAlertsUseCase,
    EvaluatePriceAlertsUseCase,
    DeliverNotificationUseCase,
    NotificationPreferencesUseCase,
    ReadNotificationsUseCase,
    PriceUpdatedListener,
    NotificationsProcessor,
    { provide: NOTIFICATION_JOBS, useClass: BullmqNotificationJobs },
    InAppChannel,
    { provide: UNSUBSCRIBE_TOKENS, useClass: HmacUnsubscribeTokens },
    {
      // Email exists only where a mail server does; without one, opting in
      // is refused rather than silently going nowhere.
      provide: NOTIFICATION_CHANNELS,
      inject: [
        InAppChannel,
        UNSUBSCRIBE_TOKENS,
        AppConfigService,
        PUSH_SENDER,
        DEVICE_TOKEN_REPOSITORY,
        SubjectNamesLoader,
      ],
      useFactory: (
        inApp: InAppChannel,
        tokens: UnsubscribeTokens,
        config: AppConfigService,
        push: PushSender,
        devices: DeviceTokenRepository,
        names: SubjectNamesLoader,
      ): NotificationChannel[] => {
        // Push is always there; it applies only to phones that registered.
        const channels: NotificationChannel[] = [inApp, new PushChannel(push, devices, names)];

        if (config.smtpUrl) {
          channels.push(
            new EmailChannel(
              new SmtpEmailSender(config.smtpUrl, config.emailFrom),
              tokens,
              config.publicBaseUrl,
              names,
            ),
          );
        }

        return channels;
      },
    },
    {
      provide: PUSH_SENDER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): PushSender =>
        new ExpoPushSender(config.expoPushUrl, config.expoAccessToken),
    },
    { provide: DEVICE_TOKEN_REPOSITORY, useClass: PrismaDeviceTokenRepository },
    { provide: CHANNEL_DELIVERY_LEDGER, useClass: PrismaChannelDeliveryLedger },
    { provide: PRICE_ALERT_REPOSITORY, useClass: PrismaPriceAlertRepository },
    {
      provide: NOTIFICATION_PREFERENCES_REPOSITORY,
      useClass: PrismaNotificationPreferencesRepository,
    },
    { provide: NOTIFICATION_REPOSITORY, useClass: PrismaNotificationRepository },
  ],
})
export class NotificationsModule {}
