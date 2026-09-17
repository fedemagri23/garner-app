import {
  Body,
  Controller,
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
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { paginate } from '../../common/http/pagination.js';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import { CurrentUser } from '../../security/presentation/current-user.decorator.js';
import { ChangeSessionStatusUseCase } from '../application/change-session-status.use-case.js';
import { ListShoppingSessionsUseCase } from '../application/list-shopping-sessions.use-case.js';
import { RecordItemProgressUseCase } from '../application/record-item-progress.use-case.js';
import { ShoppingSessionAccess } from '../application/shopping-session-access.js';
import { ShoppingSessionViewBuilder } from '../application/shopping-session-view.js';
import { StartShoppingSessionUseCase } from '../application/start-shopping-session.use-case.js';
import type { SessionAction } from '../domain/shopping-session.entity.js';
import {
  ListShoppingSessionsQueryDto,
  RecordItemProgressRequest,
  ShoppingSessionDetailResponse,
  ShoppingSessionPageResponse,
  ShoppingSessionSummaryResponse,
  StartShoppingSessionRequest,
} from './shopping-session.dto.js';

/**
 * Shopping Mode. Every mutation returns the whole trip with server-computed
 * totals, and every mutation is safe for a flaky mobile connection to retry.
 */
@ApiTags('shopping-sessions')
@ApiBearerAuth()
@Controller({ path: 'shopping-sessions', version: '1' })
export class ShoppingSessionsController {
  constructor(
    private readonly startSession: StartShoppingSessionUseCase,
    private readonly recordProgress: RecordItemProgressUseCase,
    private readonly changeStatus: ChangeSessionStatusUseCase,
    private readonly access: ShoppingSessionAccess,
    private readonly views: ShoppingSessionViewBuilder,
    private readonly listSessions: ListShoppingSessionsUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Start a trip from a list, or return the one in progress' })
  @ApiCreatedResponse({ type: ShoppingSessionDetailResponse })
  @ApiConflictResponse({ description: 'The list is empty' })
  async start(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: StartShoppingSessionRequest,
  ): Promise<ShoppingSessionDetailResponse> {
    const session = await this.startSession.execute(actor, body);
    return this.detail(session.id, actor);
  }

  @Get()
  @ApiOperation({ summary: 'List my trips, most recent first' })
  @ApiOkResponse({ type: ShoppingSessionPageResponse })
  async listMine(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListShoppingSessionsQueryDto,
  ): Promise<ShoppingSessionPageResponse> {
    const { views, totalItems } = await this.listSessions.execute(actor, {
      status: query.status,
      skip: query.skip,
      take: query.take,
    });

    return paginate(
      views.map(ShoppingSessionSummaryResponse.from),
      totalItems,
      query,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a trip with its lines and running totals' })
  @ApiOkResponse({ type: ShoppingSessionDetailResponse })
  @ApiNotFoundResponse({ description: 'Shopping session not found' })
  async get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ShoppingSessionDetailResponse> {
    return this.detail(id, actor);
  }

  @Patch(':id/items/:itemId')
  @ApiOperation({ summary: 'Mark an item purchased, record its price or quantity' })
  @ApiOkResponse({ type: ShoppingSessionDetailResponse })
  @ApiConflictResponse({ description: 'The trip is finished and would change' })
  async recordItem(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: RecordItemProgressRequest,
  ): Promise<ShoppingSessionDetailResponse> {
    await this.recordProgress.execute(actor, id, itemId, body);
    return this.detail(id, actor);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause a trip' })
  @ApiOkResponse({ type: ShoppingSessionDetailResponse })
  pause(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ShoppingSessionDetailResponse> {
    return this.transition(actor, id, 'pause');
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Continue a paused trip' })
  @ApiOkResponse({ type: ShoppingSessionDetailResponse })
  resume(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ShoppingSessionDetailResponse> {
    return this.transition(actor, id, 'resume');
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Finish a trip; retrying is safe' })
  @ApiOkResponse({ type: ShoppingSessionDetailResponse })
  @ApiConflictResponse({ description: 'The trip was abandoned' })
  complete(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ShoppingSessionDetailResponse> {
    return this.transition(actor, id, 'complete');
  }

  @Post(':id/abandon')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Give up on a trip without recording it as done' })
  @ApiOkResponse({ type: ShoppingSessionDetailResponse })
  @ApiConflictResponse({ description: 'The trip was already completed' })
  abandon(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ShoppingSessionDetailResponse> {
    return this.transition(actor, id, 'abandon');
  }

  private async transition(
    actor: AuthenticatedUser,
    id: string,
    action: SessionAction,
  ): Promise<ShoppingSessionDetailResponse> {
    await this.changeStatus.execute(actor, id, action);
    return this.detail(id, actor);
  }

  private async detail(
    sessionId: string,
    actor: AuthenticatedUser,
  ): Promise<ShoppingSessionDetailResponse> {
    const session = await this.access.loadOwned(sessionId, actor);
    return ShoppingSessionDetailResponse.fromView(await this.views.build(session));
  }
}
