import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
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
import { UserRole } from '../../security/domain/user-role.js';
import { Roles } from '../../security/presentation/roles.decorator.js';
import { RolesGuard } from '../../security/presentation/roles.guard.js';
import { BrowseSupermarketsUseCase } from '../application/browse-supermarkets.use-case.js';
import { CreateStoreUseCase } from '../application/create-store.use-case.js';
import {
  CreateSupermarketRequest,
  SupermarketResponse,
} from './supermarket.dto.js';

@ApiTags('supermarkets')
@ApiBearerAuth()
@Controller({ path: 'supermarkets', version: '1' })
export class SupermarketsController {
  constructor(
    private readonly browse: BrowseSupermarketsUseCase,
    private readonly createStore: CreateStoreUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List the supermarket chains in the catalog' })
  @ApiOkResponse({ type: [SupermarketResponse] })
  async list(): Promise<SupermarketResponse[]> {
    const supermarkets = await this.browse.list();
    return supermarkets.map(SupermarketResponse.from);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one supermarket chain' })
  @ApiOkResponse({ type: SupermarketResponse })
  @ApiNotFoundResponse({ description: 'Supermarket not found' })
  async detail(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SupermarketResponse> {
    return SupermarketResponse.from(await this.browse.get(id));
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.Moderator, UserRole.Admin)
  @ApiOperation({ summary: 'Add a supermarket chain' })
  @ApiCreatedResponse({ type: SupermarketResponse })
  @ApiConflictResponse({ description: 'Supermarket name already in use' })
  async create(
    @Body() body: CreateSupermarketRequest,
  ): Promise<SupermarketResponse> {
    return SupermarketResponse.from(
      await this.createStore.createSupermarket(body),
    );
  }
}
