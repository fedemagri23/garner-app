import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '../../security/presentation/public.decorator.js';
import { LoginUseCase } from '../application/login.use-case.js';
import { LogoutUseCase } from '../application/logout.use-case.js';
import { PasswordResetUseCase } from '../application/password-reset.use-case.js';
import { RefreshTokensUseCase } from '../application/refresh-tokens.use-case.js';
import { RegisterUseCase } from '../application/register.use-case.js';
import {
  LoginRequest,
  PasswordResetConfirmRequest,
  PasswordResetRequest,
  RefreshRequest,
  RegisterRequest,
  TokenPairResponse,
} from './auth.dto.js';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly registerUser: RegisterUseCase,
    private readonly login: LoginUseCase,
    private readonly refreshTokens: RefreshTokensUseCase,
    private readonly logout: LogoutUseCase,
    private readonly passwordReset: PasswordResetUseCase,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Create an account and start a session' })
  @ApiCreatedResponse({ type: TokenPairResponse })
  @ApiConflictResponse({ description: 'Email already registered' })
  async register(@Body() body: RegisterRequest): Promise<TokenPairResponse> {
    return this.registerUser.execute(body);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange credentials for a token pair' })
  @ApiOkResponse({ type: TokenPairResponse })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async loginUser(@Body() body: LoginRequest): Promise<TokenPairResponse> {
    return this.login.execute(body);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate a refresh token for a new pair' })
  @ApiOkResponse({ type: TokenPairResponse })
  @ApiUnauthorizedResponse({ description: 'Invalid or reused refresh token' })
  async refresh(@Body() body: RefreshRequest): Promise<TokenPairResponse> {
    return this.refreshTokens.execute(body.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a refresh token' })
  @ApiNoContentResponse()
  async logoutUser(@Body() body: RefreshRequest): Promise<void> {
    await this.logout.execute(body.refreshToken);
  }

  @Public()
  @Post('password-reset')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Email a six-digit code to reset a forgotten password',
    description: 'Always 202, whether or not the email has an account. At most three codes an hour per account.',
  })
  @ApiAcceptedResponse()
  async requestPasswordReset(@Body() body: PasswordResetRequest): Promise<void> {
    await this.passwordReset.request(body.email);
  }

  @Public()
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Set a new password with the emailed code',
    description: 'The code works once, for 30 minutes, and dies after five wrong tries. Signs the account out everywhere.',
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'The code is wrong or has expired, or the password is too short' })
  async confirmPasswordReset(@Body() body: PasswordResetConfirmRequest): Promise<void> {
    await this.passwordReset.reset(body.email, body.code, body.newPassword);
  }
}
