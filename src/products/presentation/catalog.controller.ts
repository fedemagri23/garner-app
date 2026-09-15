import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '../../security/domain/user-role.js';
import { Roles } from '../../security/presentation/roles.decorator.js';
import { RolesGuard } from '../../security/presentation/roles.guard.js';
import { BrowseCatalogUseCase } from '../application/browse-catalog.use-case.js';
import { CreateCatalogReferenceUseCase } from '../application/create-category.use-case.js';
import {
  BrandResponse,
  CategoryResponse,
  CreateBrandRequest,
  CreateCategoryRequest,
} from './product.dto.js';

/**
 * The reference lists behind category browsing and brand filtering. Both are
 * small, change rarely and are returned whole rather than paginated.
 */
@ApiTags('catalog')
@ApiBearerAuth()
@Controller({ version: '1' })
export class CatalogController {
  constructor(
    private readonly browse: BrowseCatalogUseCase,
    private readonly createReference: CreateCatalogReferenceUseCase,
  ) {}

  @Get('categories')
  @ApiOperation({ summary: 'List every category, parents before children' })
  @ApiOkResponse({ type: [CategoryResponse] })
  async categories(): Promise<CategoryResponse[]> {
    const categories = await this.browse.listCategories();
    return categories.map(CategoryResponse.from);
  }

  @Get('brands')
  @ApiOperation({ summary: 'List every brand' })
  @ApiOkResponse({ type: [BrandResponse] })
  async brands(): Promise<BrandResponse[]> {
    const brands = await this.browse.listBrands();
    return brands.map(BrandResponse.from);
  }

  @Post('categories')
  @UseGuards(RolesGuard)
  @Roles(UserRole.Moderator, UserRole.Admin)
  @ApiOperation({ summary: 'Create a category' })
  @ApiCreatedResponse({ type: CategoryResponse })
  @ApiConflictResponse({ description: 'Category name already in use' })
  async createCategory(
    @Body() body: CreateCategoryRequest,
  ): Promise<CategoryResponse> {
    return CategoryResponse.from(
      await this.createReference.createCategory(body),
    );
  }

  @Post('brands')
  @UseGuards(RolesGuard)
  @Roles(UserRole.Moderator, UserRole.Admin)
  @ApiOperation({ summary: 'Create a brand' })
  @ApiCreatedResponse({ type: BrandResponse })
  @ApiConflictResponse({ description: 'Brand name already in use' })
  async createBrand(@Body() body: CreateBrandRequest): Promise<BrandResponse> {
    return BrandResponse.from(await this.createReference.createBrand(body));
  }
}
