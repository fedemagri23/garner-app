import { Module } from '@nestjs/common';
import { AddProductBarcodeUseCase } from './application/add-product-barcode.use-case.js';
import { BrowseCatalogUseCase } from './application/browse-catalog.use-case.js';
import { CreateCatalogReferenceUseCase } from './application/create-category.use-case.js';
import { CreateProductUseCase } from './application/create-product.use-case.js';
import { FindProductByBarcodeUseCase } from './application/find-product-by-barcode.use-case.js';
import { GetProductUseCase } from './application/get-product.use-case.js';
import { SearchProductsUseCase } from './application/search-products.use-case.js';
import { UpdateProductUseCase } from './application/update-product.use-case.js';
import {
  BRAND_REPOSITORY,
  CATEGORY_REPOSITORY,
  PRODUCT_REPOSITORY,
} from './domain/product.repository.port.js';
import { PrismaBrandRepository } from './infrastructure/prisma-brand.repository.js';
import { PrismaCategoryRepository } from './infrastructure/prisma-category.repository.js';
import { PrismaProductRepository } from './infrastructure/prisma-product.repository.js';
import { CatalogController } from './presentation/catalog.controller.js';
import { ProductsController } from './presentation/products.controller.js';

/**
 * Owns the canonical catalog: products, categories, brands and barcodes.
 *
 * The three repository ports are exported because later phases read the
 * catalog constantly — pricing resolves a product before recording an
 * observation, shopping lists hold product ids, optimization needs product
 * identity — while the Prisma implementations stay private to this module.
 */
@Module({
  controllers: [ProductsController, CatalogController],
  providers: [
    SearchProductsUseCase,
    GetProductUseCase,
    FindProductByBarcodeUseCase,
    BrowseCatalogUseCase,
    CreateProductUseCase,
    UpdateProductUseCase,
    AddProductBarcodeUseCase,
    CreateCatalogReferenceUseCase,
    { provide: PRODUCT_REPOSITORY, useClass: PrismaProductRepository },
    { provide: CATEGORY_REPOSITORY, useClass: PrismaCategoryRepository },
    { provide: BRAND_REPOSITORY, useClass: PrismaBrandRepository },
  ],
  exports: [PRODUCT_REPOSITORY, CATEGORY_REPOSITORY, BRAND_REPOSITORY],
})
export class ProductsModule {}
