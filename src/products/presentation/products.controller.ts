import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
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
import { AddProductBarcodeUseCase } from '../application/add-product-barcode.use-case.js';
import { CreateProductUseCase } from '../application/create-product.use-case.js';
import { FindProductByBarcodeUseCase } from '../application/find-product-by-barcode.use-case.js';
import { GetProductUseCase } from '../application/get-product.use-case.js';
import { SearchProductsUseCase } from '../application/search-products.use-case.js';
import { UpdateProductUseCase } from '../application/update-product.use-case.js';
import {
  AddBarcodeRequest,
  CreateProductRequest,
  ProductPageResponse,
  ProductResponse,
  SearchProductsQueryDto,
  UpdateProductRequest,
} from './product.dto.js';

/**
 * Reads are open to any authenticated user; writes are curated and restricted
 * to moderators and administrators. Crowd-sourced *prices* arrive through the
 * pricing module in phase 4 — the catalog itself stays editorial, because a
 * shifting product identity would invalidate the price history hanging off it.
 */
@ApiTags('products')
@ApiBearerAuth()
@Controller({ path: 'products', version: '1' })
export class ProductsController {
  constructor(
    private readonly searchProducts: SearchProductsUseCase,
    private readonly getProduct: GetProductUseCase,
    private readonly findByBarcode: FindProductByBarcodeUseCase,
    private readonly createProduct: CreateProductUseCase,
    private readonly updateProduct: UpdateProductUseCase,
    private readonly addBarcode: AddProductBarcodeUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Search products by text, category or brand' })
  @ApiOkResponse({ type: ProductPageResponse })
  async search(
    @Query() query: SearchProductsQueryDto,
  ): Promise<ProductPageResponse> {
    const { products, totalItems } = await this.searchProducts.execute({
      term: query.search,
      categoryId: query.categoryId,
      brandId: query.brandId,
      skip: query.skip,
      take: query.take,
    });

    return paginate(products.map(ProductResponse.from), totalItems, query);
  }

  // Declared before `:id` so the literal segment is not swallowed by the
  // uuid parameter route.
  @Get('barcode/:code')
  @ApiOperation({ summary: 'Look up the product a scanned barcode identifies' })
  @ApiOkResponse({ type: ProductResponse })
  @ApiBadRequestResponse({ description: 'Malformed barcode' })
  @ApiNotFoundResponse({ description: 'No product matches this barcode' })
  async byBarcode(@Param('code') code: string): Promise<ProductResponse> {
    return ProductResponse.from(await this.findByBarcode.execute(code));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one product' })
  @ApiOkResponse({ type: ProductResponse })
  @ApiNotFoundResponse({ description: 'Product not found' })
  async detail(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProductResponse> {
    return ProductResponse.from(await this.getProduct.execute(id));
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.Moderator, UserRole.Admin)
  @ApiOperation({ summary: 'Add a product to the canonical catalog' })
  @ApiCreatedResponse({ type: ProductResponse })
  @ApiConflictResponse({ description: 'A barcode already belongs elsewhere' })
  async create(@Body() body: CreateProductRequest): Promise<ProductResponse> {
    return ProductResponse.from(await this.createProduct.execute(body));
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.Moderator, UserRole.Admin)
  @ApiOperation({ summary: 'Correct a product without changing its identity' })
  @ApiOkResponse({ type: ProductResponse })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateProductRequest,
  ): Promise<ProductResponse> {
    return ProductResponse.from(await this.updateProduct.execute(id, body));
  }

  @Post(':id/barcodes')
  @UseGuards(RolesGuard)
  @Roles(UserRole.Moderator, UserRole.Admin)
  @ApiOperation({ summary: 'Attach another barcode to a product' })
  @ApiCreatedResponse({ type: ProductResponse })
  @ApiConflictResponse({ description: 'Barcode belongs to another product' })
  async attachBarcode(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AddBarcodeRequest,
  ): Promise<ProductResponse> {
    return ProductResponse.from(
      await this.addBarcode.execute(id, body.code, body.isPrimary ?? false),
    );
  }
}
