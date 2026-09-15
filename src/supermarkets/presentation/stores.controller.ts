import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { paginate } from '../../common/http/pagination.js';
import { UserRole } from '../../security/domain/user-role.js';
import { Roles } from '../../security/presentation/roles.decorator.js';
import { RolesGuard } from '../../security/presentation/roles.guard.js';
import { CreateStoreUseCase } from '../application/create-store.use-case.js';
import { FindNearbyStoresUseCase } from '../application/find-nearby-stores.use-case.js';
import { GetStoreUseCase } from '../application/get-store.use-case.js';
import {
  CreateStoreRequest,
  ListStoresQueryDto,
  NearbyStoreResponse,
  NearbyStoresQueryDto,
  StorePageResponse,
  StoreResponse,
} from './supermarket.dto.js';

/**
 * Stores are their own resource rather than a sub-path of a supermarket:
 * "what is near me" spans chains, and that is the query shoppers actually ask.
 */
@ApiTags('stores')
@ApiBearerAuth()
@Controller({ path: 'stores', version: '1' })
export class StoresController {
  constructor(
    private readonly getStore: GetStoreUseCase,
    private readonly findNearby: FindNearbyStoresUseCase,
    private readonly createStore: CreateStoreUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List stores, optionally by chain or city' })
  @ApiOkResponse({ type: StorePageResponse })
  async list(@Query() query: ListStoresQueryDto): Promise<StorePageResponse> {
    const { stores, totalItems } = await this.getStore.listStores({
      supermarketId: query.supermarketId,
      city: query.city,
      skip: query.skip,
      take: query.take,
    });

    return paginate(stores.map(StoreResponse.from), totalItems, query);
  }

  // Ahead of `:id` so the literal path is not captured as a store id.
  @Get('nearby')
  @ApiOperation({ summary: 'Find open stores within a radius, nearest first' })
  @ApiOkResponse({ type: [NearbyStoreResponse] })
  async nearby(
    @Query() query: NearbyStoresQueryDto,
  ): Promise<NearbyStoreResponse[]> {
    const nearby = await this.findNearby.execute(query);
    return nearby.map(NearbyStoreResponse.fromNearby);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one store' })
  @ApiOkResponse({ type: StoreResponse })
  @ApiNotFoundResponse({ description: 'Store not found' })
  async detail(@Param('id', ParseUUIDPipe) id: string): Promise<StoreResponse> {
    return StoreResponse.from(await this.getStore.execute(id));
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.Moderator, UserRole.Admin)
  @ApiOperation({ summary: 'Add a store location to a chain' })
  @ApiCreatedResponse({ type: StoreResponse })
  async create(@Body() body: CreateStoreRequest): Promise<StoreResponse> {
    return StoreResponse.from(await this.createStore.createStore(body));
  }
}
