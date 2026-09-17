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
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
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
import { ManageListItemsUseCase } from '../application/manage-list-items.use-case.js';
import { ManageShoppingListsUseCase } from '../application/manage-shopping-lists.use-case.js';
import { ShoppingListAccess } from '../application/shopping-list-access.js';
import { ShoppingListViewBuilder } from '../application/shopping-list-view.js';
import {
  AddShoppingListItemRequest,
  CreateShoppingListRequest,
  DuplicateShoppingListRequest,
  ListShoppingListsQueryDto,
  ReorderShoppingListItemsRequest,
  ShoppingListDetailResponse,
  ShoppingListPageResponse,
  ShoppingListSummaryResponse,
  UpdateShoppingListItemRequest,
  UpdateShoppingListRequest,
} from './shopping-list.dto.js';

/**
 * Every route acts on the caller's own lists; another user's list answers as
 * forbidden. Mutations on items return the whole list, so the client always
 * holds totals the server computed rather than ones it added up itself.
 */
@ApiTags('shopping-lists')
@ApiBearerAuth()
@Controller({ path: 'shopping-lists', version: '1' })
export class ShoppingListsController {
  constructor(
    private readonly manageLists: ManageShoppingListsUseCase,
    private readonly manageItems: ManageListItemsUseCase,
    private readonly access: ShoppingListAccess,
    private readonly views: ShoppingListViewBuilder,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a shopping list' })
  @ApiCreatedResponse({ type: ShoppingListDetailResponse })
  async create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: CreateShoppingListRequest,
  ): Promise<ShoppingListDetailResponse> {
    const list = await this.manageLists.create(actor, body);
    return this.detail(list.id, actor);
  }

  @Get()
  @ApiOperation({ summary: 'List my shopping lists, most recently changed first' })
  @ApiOkResponse({ type: ShoppingListPageResponse })
  async listMine(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListShoppingListsQueryDto,
  ): Promise<ShoppingListPageResponse> {
    const { summaries, totalItems } = await this.manageLists.listMine(actor, {
      skip: query.skip,
      take: query.take,
    });

    return paginate(
      summaries.map(ShoppingListSummaryResponse.from),
      totalItems,
      query,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a shopping list with its items and totals' })
  @ApiOkResponse({ type: ShoppingListDetailResponse })
  @ApiNotFoundResponse({ description: 'Shopping list not found' })
  async get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ShoppingListDetailResponse> {
    return this.detail(id, actor);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a list or change its preferences' })
  @ApiOkResponse({ type: ShoppingListDetailResponse })
  async update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateShoppingListRequest,
  ): Promise<ShoppingListDetailResponse> {
    await this.manageLists.update(actor, id, body);
    return this.detail(id, actor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a list; trips already started from it are kept',
  })
  @ApiNoContentResponse()
  async remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.manageLists.delete(actor, id);
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Copy a list and its items into a new list' })
  @ApiCreatedResponse({ type: ShoppingListDetailResponse })
  async duplicate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DuplicateShoppingListRequest,
  ): Promise<ShoppingListDetailResponse> {
    const copy = await this.manageLists.duplicate(actor, id, body);
    return this.detail(copy.id, actor);
  }

  @Post(':id/items')
  @ApiOperation({ summary: 'Add a product to the list' })
  @ApiCreatedResponse({ type: ShoppingListDetailResponse })
  @ApiConflictResponse({ description: 'The client id belongs to another item' })
  @ApiUnprocessableEntityResponse({
    description: 'Product retired, or the list is full',
  })
  async addItem(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AddShoppingListItemRequest,
  ): Promise<ShoppingListDetailResponse> {
    await this.manageItems.add(actor, id, body);
    return this.detail(id, actor);
  }

  // A literal segment, declared before the `:itemId` routes.
  @Put(':id/items/order')
  @ApiOperation({ summary: 'Set the manual order of every item' })
  @ApiOkResponse({ type: ShoppingListDetailResponse })
  async reorder(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReorderShoppingListItemsRequest,
  ): Promise<ShoppingListDetailResponse> {
    await this.manageItems.reorder(actor, id, body.itemIds);
    return this.detail(id, actor);
  }

  @Patch(':id/items/:itemId')
  @ApiOperation({ summary: 'Change quantity, notes, expected price or store' })
  @ApiOkResponse({ type: ShoppingListDetailResponse })
  async updateItem(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: UpdateShoppingListItemRequest,
  ): Promise<ShoppingListDetailResponse> {
    await this.manageItems.update(actor, id, itemId, body);
    return this.detail(id, actor);
  }

  @Delete(':id/items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an item from the list' })
  @ApiNoContentResponse()
  async removeItem(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    await this.manageItems.remove(actor, id, itemId);
  }

  private async detail(
    listId: string,
    actor: AuthenticatedUser,
  ): Promise<ShoppingListDetailResponse> {
    const list = await this.access.loadOwned(listId, actor);
    return ShoppingListDetailResponse.fromView(await this.views.build(list));
  }
}
