import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import { CurrentUser } from '../../security/presentation/current-user.decorator.js';
import { GetUserProfileUseCase } from '../application/get-user-profile.use-case.js';
import { UpdateUserProfileUseCase } from '../application/update-user-profile.use-case.js';
import { UserPreferencesUseCase } from '../application/user-preferences.use-case.js';
import {
  UpdateUserPreferencesRequest,
  UpdateUserProfileRequest,
  UserPreferencesResponse,
  UserResponse,
} from './user.dto.js';

/**
 * Every route here is scoped to `me`. There is deliberately no
 * `/users/:id` — a user-owned resource addressed by someone else's id is the
 * shape that invites an ownership bug, so the route simply does not exist.
 */
@ApiTags('users')
@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(
    private readonly getUserProfile: GetUserProfileUseCase,
    private readonly updateUserProfile: UpdateUserProfileUseCase,
    private readonly preferences: UserPreferencesUseCase,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  @ApiOkResponse({ type: UserResponse })
  async me(@CurrentUser() actor: AuthenticatedUser): Promise<UserResponse> {
    const user = await this.getUserProfile.execute(actor.id);
    return UserResponse.from(user);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the authenticated user profile' })
  @ApiOkResponse({ type: UserResponse })
  async updateMe(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: UpdateUserProfileRequest,
  ): Promise<UserResponse> {
    const user = await this.updateUserProfile.execute(actor.id, body);
    return UserResponse.from(user);
  }

  @Get('me/preferences')
  @ApiOperation({ summary: 'Get location and interest preferences' })
  @ApiOkResponse({ type: UserPreferencesResponse })
  async myPreferences(
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserPreferencesResponse> {
    return UserPreferencesResponse.from(await this.preferences.get(actor.id));
  }

  @Patch('me/preferences')
  @ApiOperation({ summary: 'Update location and interest preferences' })
  @ApiOkResponse({ type: UserPreferencesResponse })
  @ApiBadRequestResponse({
    description: 'Half a coordinate, or an unknown interest category',
  })
  async updateMyPreferences(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: UpdateUserPreferencesRequest,
  ): Promise<UserPreferencesResponse> {
    return UserPreferencesResponse.from(
      await this.preferences.update(actor.id, body),
    );
  }
}
