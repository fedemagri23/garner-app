import {
  BadRequestException,
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
  Query,
  UseGuards,
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
} from '@nestjs/swagger';
import { paginate } from '../../common/http/pagination.js';
import { UserRole } from '../../security/domain/user-role.js';
import { Roles } from '../../security/presentation/roles.decorator.js';
import { RolesGuard } from '../../security/presentation/roles.guard.js';
import { ManagePriceSourcesUseCase } from '../application/manage-price-sources.use-case.js';
import { RunSourceImportUseCase } from '../application/run-source-import.use-case.js';
import {
  AdaptersResponse,
  CreatePriceSourceRequest,
  ExternalProductLinkPageResponse,
  ExternalProductLinkResponse,
  ImportRunResponse,
  LinkStoreRequest,
  ListLinksQueryDto,
  PriceSourceResponse,
  ResolveLinkRequest,
  UpdatePriceSourceRequest,
} from './price-source.dto.js';

/**
 * Operating the integrations: which sources exist, how their imports went, and
 * the decisions only a person can make — what an unrecognized product is, and
 * which store a source's branch is.
 *
 * Administrators only. A source's configuration names endpoints and decides
 * where real prices are filed.
 */
@ApiTags('price-sources')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.Admin)
@Controller({ path: 'price-sources', version: '1' })
export class PriceSourcesController {
  constructor(
    private readonly sources: ManagePriceSourcesUseCase,
    private readonly runImport: RunSourceImportUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List configured price sources and their status' })
  @ApiOkResponse({ type: [PriceSourceResponse] })
  async list(): Promise<PriceSourceResponse[]> {
    const sources = await this.sources.list();
    return sources.map(PriceSourceResponse.from);
  }

  // Declared before `:id`, so the literal segment is not read as an id.
  @Get('adapters')
  @ApiOperation({ summary: 'List the adapters this deployment can run' })
  @ApiOkResponse({ type: AdaptersResponse })
  adapters(): AdaptersResponse {
    return { adapters: this.sources.availableAdapters() };
  }

  @Post()
  @ApiOperation({ summary: 'Register a price source' })
  @ApiCreatedResponse({ type: PriceSourceResponse })
  @ApiConflictResponse({ description: 'A source with this name exists' })
  async create(
    @Body() body: CreatePriceSourceRequest,
  ): Promise<PriceSourceResponse> {
    return PriceSourceResponse.from(await this.sources.create(body));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one price source' })
  @ApiOkResponse({ type: PriceSourceResponse })
  @ApiNotFoundResponse({ description: 'Price source not found' })
  async get(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PriceSourceResponse> {
    return PriceSourceResponse.from(await this.sources.get(id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Enable, disable or reconfigure a source' })
  @ApiOkResponse({ type: PriceSourceResponse })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdatePriceSourceRequest,
  ): Promise<PriceSourceResponse> {
    return PriceSourceResponse.from(await this.sources.update(id, body));
  }

  @Post(':id/imports')
  @ApiOperation({
    summary: 'Run this source’s import now; the day’s slot runs only once',
  })
  @ApiCreatedResponse({ type: ImportRunResponse })
  async import(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ImportRunResponse> {
    const { run } = await this.runImport.execute(id);
    return ImportRunResponse.from(run);
  }

  @Get(':id/imports')
  @ApiOperation({ summary: 'Recent import runs, newest first' })
  @ApiOkResponse({ type: [ImportRunResponse] })
  async runs(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ImportRunResponse[]> {
    const runs = await this.sources.listRuns(id, 20);
    return runs.map(ImportRunResponse.from);
  }

  @Get(':id/products')
  @ApiOperation({
    summary: 'External products, by default those awaiting a decision',
  })
  @ApiOkResponse({ type: ExternalProductLinkPageResponse })
  async links(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListLinksQueryDto,
  ): Promise<ExternalProductLinkPageResponse> {
    const { links, totalItems } = await this.sources.listLinks(
      id,
      query.status,
      { skip: query.skip, take: query.take },
    );

    return paginate(links.map(ExternalProductLinkResponse.from), totalItems, query);
  }

  @Post(':id/products/:externalProductId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Match an external product to a canonical one, or ignore it',
  })
  @ApiOkResponse({ type: ExternalProductLinkResponse })
  async resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('externalProductId') externalProductId: string,
    @Body() body: ResolveLinkRequest,
  ): Promise<ExternalProductLinkResponse> {
    if ((body.productId === undefined) === (body.ignore !== true)) {
      throw new BadRequestException(
        'Give either a productId or ignore: true, not both',
      );
    }

    return ExternalProductLinkResponse.from(
      await this.sources.resolveLink(
        id,
        externalProductId,
        body.productId ? { productId: body.productId } : { ignore: true },
      ),
    );
  }

  @Get(':id/stores')
  @ApiOperation({ summary: 'How this source’s branches map to stores' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      additionalProperties: { type: 'string', format: 'uuid' },
      example: { '0042': '0b3c…' },
    },
  })
  async storeLinks(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Record<string, string>> {
    return Object.fromEntries(await this.sources.storeLinksFor(id));
  }

  @Post(':id/stores')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Map one of the source’s branches to a store' })
  @ApiNoContentResponse()
  async linkStore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: LinkStoreRequest,
  ): Promise<void> {
    await this.sources.linkStore(id, body.externalStoreId, body.storeId);
  }

  @Delete(':id/stores/:externalStoreId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a branch mapping' })
  @ApiNoContentResponse()
  async unlinkStore(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('externalStoreId') externalStoreId: string,
  ): Promise<void> {
    await this.sources.unlinkStore(id, externalStoreId);
  }
}
