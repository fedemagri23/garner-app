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
  Res,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { paginate } from '../../common/http/pagination.js';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import { CurrentUser } from '../../security/presentation/current-user.decorator.js';
import { OptimizationPreferencesUseCase } from '../application/optimization-preferences.use-case.js';
import { OptimizationViewBuilder } from '../application/optimization-view.js';
import { RequestOptimizationUseCase } from '../application/request-optimization.use-case.js';
import {
  ListOptimizationsQueryDto,
  OptimizationPageResponse,
  OptimizationPreferencesResponse,
  OptimizationResponse,
  OptimizationSummaryResponse,
  OptimizeListRequest,
  UpdateOptimizationPreferencesRequest,
} from './optimization.dto.js';

/**
 * Asking where to buy a list, and reading the answer.
 *
 * Optimizing is accepted and computed in the background: the client polls the
 * returned optimization until it is COMPLETED. A recent answer to the same
 * question comes back immediately instead.
 */
@ApiTags('optimization')
@ApiBearerAuth()
@Controller({ version: '1' })
export class OptimizationController {
  constructor(
    private readonly requestOptimization: RequestOptimizationUseCase,
    private readonly views: OptimizationViewBuilder,
    private readonly preferences: OptimizationPreferencesUseCase,
  ) {}

  @Post('shopping-lists/:id/optimize')
  @ApiOperation({ summary: 'Work out where to buy this list' })
  @ApiAcceptedResponse({
    type: OptimizationResponse,
    description: '202 while it is computed; 200 when a recent answer is reused',
  })
  @ApiConflictResponse({ description: 'The list is empty' })
  async optimize(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) listId: string,
    @Body() body: OptimizeListRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OptimizationResponse> {
    const { request, reused } = await this.requestOptimization.execute(
      actor,
      listId,
      body,
    );

    response.status(reused ? HttpStatus.OK : HttpStatus.ACCEPTED);

    return OptimizationResponse.from(await this.views.build(request));
  }

  @Get('optimizations')
  @ApiOperation({ summary: 'My optimizations, newest first' })
  @ApiOkResponse({ type: OptimizationPageResponse })
  async list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListOptimizationsQueryDto,
  ): Promise<OptimizationPageResponse> {
    const { requests, totalItems } = await this.views.listMine(actor, {
      listId: query.listId,
      skip: query.skip,
      take: query.take,
    });

    return paginate(
      requests.map(OptimizationSummaryResponse.from),
      totalItems,
      query,
    );
  }

  @Get('optimizations/:id')
  @ApiOperation({ summary: 'One optimization, with its plans once computed' })
  @ApiOkResponse({ type: OptimizationResponse })
  @ApiNotFoundResponse({ description: 'Optimization not found' })
  async get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OptimizationResponse> {
    return OptimizationResponse.from(await this.views.loadOwned(id, actor));
  }

  @Get('optimization-preferences')
  @ApiOperation({ summary: 'My standing optimization preferences' })
  @ApiOkResponse({ type: OptimizationPreferencesResponse })
  async myPreferences(
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<OptimizationPreferencesResponse> {
    return OptimizationPreferencesResponse.from(
      await this.preferences.get(actor),
    );
  }

  @Patch('optimization-preferences')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change how far I will go to save money' })
  @ApiOkResponse({ type: OptimizationPreferencesResponse })
  async updatePreferences(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: UpdateOptimizationPreferencesRequest,
  ): Promise<OptimizationPreferencesResponse> {
    return OptimizationPreferencesResponse.from(
      await this.preferences.update(actor, body),
    );
  }
}
