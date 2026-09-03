import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import { CurrentUser } from '../../security/presentation/current-user.decorator.js';
import { GetUserProfileUseCase } from '../application/get-user-profile.use-case.js';
import { UserResponse } from './user.dto.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly getUserProfile: GetUserProfileUseCase) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  @ApiOkResponse({ type: UserResponse })
  async me(@CurrentUser() actor: AuthenticatedUser): Promise<UserResponse> {
    const user = await this.getUserProfile.execute(actor.id);
    return UserResponse.from(user);
  }
}
