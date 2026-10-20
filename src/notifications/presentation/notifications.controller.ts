import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { paginate } from '../../common/http/pagination.js';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import { CurrentUser } from '../../security/presentation/current-user.decorator.js';
import { SubjectNamesLoader } from '../application/notification-names.js';
import { ManagePriceAlertsUseCase } from '../application/manage-price-alerts.use-case.js';
import { NotificationPreferencesUseCase } from '../application/notification-preferences.use-case.js';
import { ReadNotificationsUseCase } from '../application/read-notifications.use-case.js';
import {
  CreatePriceAlertRequest,
  ListNotificationsQueryDto,
  ListPriceAlertsQueryDto,
  NotificationPageResponse,
  NotificationPreferencesResponse,
  NotificationResponse,
  PriceAlertPageResponse,
  PriceAlertResponse,
  UpdateNotificationPreferencesRequest,
  UpdatePriceAlertRequest,
} from './notification.dto.js';

/**
 * Alerts a shopper sets, messages they receive, and how they want to be
 * reached. Everything here is their own; there is no route to anyone else's.
 */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller({ version: '1' })
export class NotificationsController {
  constructor(
    private readonly alerts: ManagePriceAlertsUseCase,
    private readonly preferences: NotificationPreferencesUseCase,
    private readonly inbox: ReadNotificationsUseCase,
    private readonly names: SubjectNamesLoader,
  ) {}

  @Post('price-alerts')
  @ApiOperation({ summary: 'Watch a product’s price' })
  @ApiCreatedResponse({ type: PriceAlertResponse })
  @ApiBadRequestResponse({ description: 'The alert is missing the figures it needs' })
  async createAlert(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: CreatePriceAlertRequest,
  ): Promise<PriceAlertResponse> {
    const alert = await this.alerts.create(actor, body);
    return PriceAlertResponse.from(alert, (await this.names.forSubjects([alert]))(alert));
  }

  @Get('price-alerts')
  @ApiOperation({ summary: 'My price alerts' })
  @ApiOkResponse({ type: PriceAlertPageResponse })
  async listAlerts(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListPriceAlertsQueryDto,
  ): Promise<PriceAlertPageResponse> {
    const { alerts, totalItems } = await this.alerts.listMine(actor, {
      skip: query.skip,
      take: query.take,
    });

    const namesOf = await this.names.forSubjects(alerts);

    return paginate(
      alerts.map((alert) => PriceAlertResponse.from(alert, namesOf(alert))),
      totalItems,
      query,
    );
  }

  @Patch('price-alerts/:id')
  @ApiOperation({ summary: 'Pause an alert or change what it watches for' })
  @ApiOkResponse({ type: PriceAlertResponse })
  @ApiNotFoundResponse({ description: 'Price alert not found' })
  async updateAlert(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdatePriceAlertRequest,
  ): Promise<PriceAlertResponse> {
    const alert = await this.alerts.update(actor, id, body);
    return PriceAlertResponse.from(alert, (await this.names.forSubjects([alert]))(alert));
  }

  @Delete('price-alerts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Stop watching' })
  @ApiNoContentResponse()
  async deleteAlert(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.alerts.delete(actor, id);
  }

  @Get('notifications')
  @ApiOperation({ summary: 'My messages, newest first' })
  @ApiOkResponse({ type: NotificationPageResponse })
  async listNotifications(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<NotificationPageResponse> {
    const { notifications, totalItems, unreadCount } = await this.inbox.list(
      actor,
      {
        unreadOnly: query.unreadOnly ?? false,
        skip: query.skip,
        take: query.take,
      },
    );

    const namesOf = await this.names.forSubjects(notifications);

    return {
      ...paginate(
        notifications.map((notification) => NotificationResponse.from(notification, namesOf(notification))),
        totalItems,
        query,
      ),
      unreadCount,
    };
  }

  @Post('notifications/:id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a message read; repeating it is harmless' })
  @ApiOkResponse({ type: NotificationResponse })
  async markRead(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NotificationResponse> {
    const notification = await this.inbox.markRead(actor, id);
    return NotificationResponse.from(notification, (await this.names.forSubjects([notification]))(notification));
  }

  @Get('notification-preferences')
  @ApiOperation({ summary: 'How and when I want to be reached' })
  @ApiOkResponse({ type: NotificationPreferencesResponse })
  async myPreferences(
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<NotificationPreferencesResponse> {
    return NotificationPreferencesResponse.from(
      await this.preferences.get(actor.id),
      this.preferences.emailAvailable,
    );
  }

  @Patch('notification-preferences')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Turn categories or email on and off, or set quiet hours' })
  @ApiUnprocessableEntityResponse({ description: 'Email asked for, but this server cannot send it' })
  @ApiOkResponse({ type: NotificationPreferencesResponse })
  async updatePreferences(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: UpdateNotificationPreferencesRequest,
  ): Promise<NotificationPreferencesResponse> {
    return NotificationPreferencesResponse.from(
      await this.preferences.update(actor, body),
      this.preferences.emailAvailable,
    );
  }
}
