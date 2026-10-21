import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import { UserRole } from '../../security/domain/user-role.js';
import { CurrentUser } from '../../security/presentation/current-user.decorator.js';
import { Roles } from '../../security/presentation/roles.decorator.js';
import { RolesGuard } from '../../security/presentation/roles.guard.js';
import { ConfirmProductUseCase } from '../application/confirm-product.use-case.js';
import { FlagContentUseCase } from '../application/flag-content.use-case.js';
import { ModerateUseCase, type ModerationAction } from '../application/moderate.use-case.js';
import { MyAdditionsUseCase } from '../application/my-additions.use-case.js';
import { SuggestProductsUseCase } from '../application/suggest-products.use-case.js';
import {
  AddedProductResponse,
  AddedStoreResponse,
  ConfirmationsResponse,
  FlagRequest,
  MyAdditionsResponse,
  ProductSuggestionResponse,
  ReviewItemResponse,
  SuggestProductsQuery,
  ViewerSayResponse,
} from './community.dto.js';

/** What shoppers say about products others added. */
@ApiTags('community')
@ApiBearerAuth()
@Controller({ path: 'products', version: '1' })
export class ProductCommunityController {
  constructor(
    private readonly confirmations: ConfirmProductUseCase,
    private readonly flags: FlagContentUseCase,
    private readonly additions: MyAdditionsUseCase,
  ) {}

  @Get(':id/viewer-say')
  @ApiOperation({ summary: 'Whether you added, confirmed or reported this product' })
  @ApiOkResponse({ type: ViewerSayResponse })
  @ApiNotFoundResponse({ description: 'Product not found' })
  viewerSay(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ViewerSayResponse> {
    return this.additions.say(actor, 'PRODUCT', id);
  }

  @Post(':id/confirmations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Say a product exists and is described right', description: 'Once per person; not for your own.' })
  @ApiOkResponse({ type: ConfirmationsResponse })
  @ApiForbiddenResponse({ description: 'You added it yourself' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  confirm(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConfirmationsResponse> {
    return this.confirmations.confirm(actor, id);
  }

  @Delete(':id/confirmations')
  @ApiOperation({ summary: 'Take back your confirmation' })
  @ApiOkResponse({ type: ConfirmationsResponse })
  withdraw(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConfirmationsResponse> {
    return this.confirmations.withdraw(actor, id);
  }

  @Post(':id/flags')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Report a product as a duplicate, wrong, made up or inappropriate' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'You added it yourself' })
  @ApiTooManyRequestsResponse({ description: 'Too many reports today' })
  async flag(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: FlagRequest,
  ): Promise<void> {
    await this.flags.execute(actor, 'PRODUCT', id, body.reason);
  }
}

@ApiTags('community')
@ApiBearerAuth()
@Controller({ path: 'stores', version: '1' })
export class StoreCommunityController {
  constructor(
    private readonly flags: FlagContentUseCase,
    private readonly additions: MyAdditionsUseCase,
  ) {}

  @Get(':id/viewer-say')
  @ApiOperation({ summary: 'Whether you added or reported this shop' })
  @ApiOkResponse({ type: ViewerSayResponse })
  @ApiNotFoundResponse({ description: 'Store not found, or someone else’s private shop' })
  viewerSay(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ViewerSayResponse> {
    return this.additions.say(actor, 'STORE', id);
  }

  @Post(':id/flags')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Report a shop as a duplicate, wrong, made up or inappropriate' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'You added it yourself' })
  @ApiTooManyRequestsResponse({ description: 'Too many reports today' })
  async flag(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: FlagRequest,
  ): Promise<void> {
    await this.flags.execute(actor, 'STORE', id, body.reason);
  }
}

@ApiTags('community')
@ApiBearerAuth()
@Controller({ path: 'product-suggestions', version: '1' })
export class ProductSuggestionsController {
  constructor(private readonly suggestions: SuggestProductsUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Products already in the catalog with a name like this one, before adding a new one' })
  @ApiOkResponse({ type: [ProductSuggestionResponse] })
  async suggest(@Query() query: SuggestProductsQuery): Promise<ProductSuggestionResponse[]> {
    return (await this.suggestions.execute(query.name, query.limit)).map(ProductSuggestionResponse.from);
  }
}

/** What a shopper added, and where each stands. */
@ApiTags('community')
@ApiBearerAuth()
@Controller({ path: 'community', version: '1' })
export class MyAdditionsController {
  constructor(private readonly additions: MyAdditionsUseCase) {}

  @Get('mine')
  @ApiOperation({
    summary: 'The products and shops you added, newest first',
    description: 'Hidden and private ones included, each with a status for you to read.',
  })
  @ApiOkResponse({ type: MyAdditionsResponse })
  async mine(@CurrentUser() actor: AuthenticatedUser): Promise<MyAdditionsResponse> {
    const { products, stores } = await this.additions.list(actor);
    return { products: products.map(AddedProductResponse.from), stores: stores.map(AddedStoreResponse.from) };
  }
}

/** The path's word for each kind of entry (values, as `ParseEnumPipe` checks them), and what it means. */
const TARGET_WORDS = { products: 'products', stores: 'stores' } as const;
const TARGETS = { products: 'PRODUCT', stores: 'STORE' } as const;
const ACTIONS = { verify: 'verify', hide: 'hide', restore: 'restore' } as const;

/** The team's side: what needs a look, and the decisions on it. */
@ApiTags('moderation')
@ApiBearerAuth()
@Controller({ path: 'moderation', version: '1' })
@UseGuards(RolesGuard)
@Roles(UserRole.Moderator, UserRole.Admin)
export class ModerationController {
  constructor(private readonly moderation: ModerateUseCase) {}

  @Get('queue')
  @ApiOperation({ summary: 'Entries pulled by flags, then the most flagged' })
  @ApiOkResponse({ type: [ReviewItemResponse] })
  async queue(): Promise<ReviewItemResponse[]> {
    return (await this.moderation.queue()).map(ReviewItemResponse.from);
  }

  @Post(':target/:id/:action')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'target', enum: Object.values(TARGET_WORDS) })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'action', enum: Object.values(ACTIONS) })
  @ApiOperation({ summary: 'Verify, hide or restore a product or shop' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'No such product or shop' })
  async act(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('target', new ParseEnumPipe(TARGET_WORDS)) target: keyof typeof TARGETS,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('action', new ParseEnumPipe(ACTIONS)) action: ModerationAction,
  ): Promise<void> {
    await this.moderation.act(actor, TARGETS[target], id, action);
  }
}
