import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PriceIntelligenceModule } from '../price-intelligence/price-intelligence.module.js';
import { ProductsModule } from '../products/products.module.js';
import { SupermarketsModule } from '../supermarkets/supermarkets.module.js';
import { DeliverNotificationUseCase } from './application/deliver-notification.use-case.js';
import { EvaluatePriceAlertsUseCase } from './application/evaluate-price-alerts.use-case.js';
import { ManagePriceAlertsUseCase } from './application/manage-price-alerts.use-case.js';
import { NotificationPreferencesUseCase } from './application/notification-preferences.use-case.js';
import { PriceUpdatedListener } from './application/price-updated.listener.js';
import { ReadNotificationsUseCase } from './application/read-notifications.use-case.js';
import {
  NOTIFICATION_DELIVERY,
  NOTIFICATION_JOBS,
  NOTIFICATION_PREFERENCES_REPOSITORY,
  NOTIFICATION_REPOSITORY,
  PRICE_ALERT_REPOSITORY,
} from './domain/notification.repository.port.js';
import {
  BullmqNotificationJobs,
  NOTIFICATIONS_QUEUE,
  NotificationsProcessor,
} from './infrastructure/notifications.queue.js';
import {
  PrismaNotificationPreferencesRepository,
  PrismaNotificationRepository,
  PrismaPriceAlertRepository,
} from './infrastructure/prisma-notification.repository.js';
import { StoredNotificationDelivery } from './infrastructure/stored-notification-delivery.js';
import { NotificationsController } from './presentation/notifications.controller.js';

/**
 * Price alerts and the messages they raise.
 *
 * Evaluation runs in a worker off DerivedPriceUpdated, so nobody submitting a
 * price waits on other people's alerts. Delivery is behind one port: today it
 * stores the message for the client to read, and push or email would be a
 * second implementation rather than a change to any of this.
 */
@Module({
  imports: [
    ProductsModule,
    SupermarketsModule,
    PriceIntelligenceModule,
    BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE }),
  ],
  controllers: [NotificationsController],
  providers: [
    ManagePriceAlertsUseCase,
    EvaluatePriceAlertsUseCase,
    DeliverNotificationUseCase,
    NotificationPreferencesUseCase,
    ReadNotificationsUseCase,
    PriceUpdatedListener,
    NotificationsProcessor,
    { provide: NOTIFICATION_JOBS, useClass: BullmqNotificationJobs },
    { provide: NOTIFICATION_DELIVERY, useClass: StoredNotificationDelivery },
    { provide: PRICE_ALERT_REPOSITORY, useClass: PrismaPriceAlertRepository },
    {
      provide: NOTIFICATION_PREFERENCES_REPOSITORY,
      useClass: PrismaNotificationPreferencesRepository,
    },
    { provide: NOTIFICATION_REPOSITORY, useClass: PrismaNotificationRepository },
  ],
})
export class NotificationsModule {}
