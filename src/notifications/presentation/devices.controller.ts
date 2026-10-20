import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import { CurrentUser } from '../../security/presentation/current-user.decorator.js';
import { ManageDevicesUseCase } from '../application/manage-devices.use-case.js';
import {
  DeviceResponse,
  RegisterDeviceRequest,
  TestPushResponse,
} from './notification.dto.js';

/** The phones a shopper is reached on when the app is closed. */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller({ path: 'devices', version: '1' })
export class DevicesController {
  constructor(private readonly devices: ManageDevicesUseCase) {}

  @Post()
  @ApiOperation({
    summary: 'Register this phone for push notifications',
    description:
      'Idempotent: registering the same token again refreshes it. A token another ' +
      'account had moves to this one.',
  })
  @ApiCreatedResponse({ type: DeviceResponse })
  async register(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: RegisterDeviceRequest,
  ): Promise<DeviceResponse> {
    return DeviceResponse.from(await this.devices.register(actor, body.token, body.platform));
  }

  // Ahead of `:token` so the literal path is not read as a token.
  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a test push to my registered phones' })
  @ApiOkResponse({ type: TestPushResponse })
  @ApiBadGatewayResponse({ description: 'The push service could not be reached' })
  async test(@CurrentUser() actor: AuthenticatedUser): Promise<TestPushResponse> {
    return this.devices.sendTest(actor);
  }

  @Delete(':token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Stop sending push notifications to this phone' })
  @ApiNoContentResponse()
  async unregister(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('token') token: string,
  ): Promise<void> {
    await this.devices.unregister(actor, token);
  }
}
