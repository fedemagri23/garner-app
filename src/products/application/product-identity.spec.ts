import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Category, Product } from '../domain/product.entity.js';
import type {
  BrandRepository,
  CategoryRepository,
  ProductRepository,
} from '../domain/product.repository.port.js';
import { UnitOfMeasure } from '../domain/unit-of-measure.js';
import { CreateProductUseCase } from './create-product.use-case.js';
import { UpdateProductUseCase } from './update-product.use-case.js';

const dairy: Category = {
  id: 'cat-1',
  name: 'Dairy',
  slug: 'dairy',
  parentId: null,
};

const milk: Product = {
  id: 'prod-1',
  name: 'Leche Entera 1L',
  normalizedName: 'leche entera 1l',
  description: null,
  brand: null,
  category: dairy,
  packageSize: 1,
  unit: UnitOfMeasure.Liter,
  imageUrl: null,
  isActive: true,
  barcodes: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

/**
 * The rule the whole catalog rests on: a product's identity is stable, because
 * every price observation ever recorded points at its id. These tests pin the
 * two ways that could break — a correction replacing the product, and a
 * barcode pointing at two products at once.
 */
describe('product identity', () => {
  let products: jest.Mocked<ProductRepository>;
  let categories: jest.Mocked<CategoryRepository>;
  let brands: jest.Mocked<BrandRepository>;

  beforeEach(() => {
    products = {
      search: jest.fn(),
      findById: jest.fn().mockResolvedValue(milk),
      findManyByIds: jest.fn(),
      findByBarcode: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(milk),
      update: jest.fn().mockImplementation(async (id, input) => ({
        ...milk,
        id,
        ...input,
      })),
      addBarcode: jest.fn().mockResolvedValue(milk),
    };
    categories = {
      findAll: jest.fn(),
      findById: jest.fn().mockResolvedValue(dairy),
      findBySlug: jest.fn(),
      findBySlugs: jest.fn(),
      findSubtreeIds: jest.fn(),
      create: jest.fn(),
    };
    brands = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findBySlug: jest.fn(),
      create: jest.fn(),
    };
  });

  describe('UpdateProductUseCase', () => {
    it('keeps the id when a product is corrected', async () => {
      const useCase = new UpdateProductUseCase(products, categories, brands);

      const updated = await useCase.execute('prod-1', {
        name: 'Leche Entera La Serenísima 1L',
        categoryId: 'cat-1',
      });

      expect(updated.id).toBe('prod-1');
      expect(products.update).toHaveBeenCalledWith('prod-1', expect.anything());
      expect(products.create).not.toHaveBeenCalled();
    });

    it('derives the matching key from the new name rather than trusting a caller', async () => {
      const useCase = new UpdateProductUseCase(products, categories, brands);

      await useCase.execute('prod-1', { name: '  Leche  DESCREMADA 1L ' });

      expect(products.update).toHaveBeenCalledWith('prod-1', {
        name: 'Leche  DESCREMADA 1L',
        normalizedName: 'leche descremada 1l',
        brandId: undefined,
        categoryId: undefined,
        description: undefined,
        imageUrl: undefined,
        isActive: undefined,
        packageSize: undefined,
        unit: undefined,
      });
    });

    it('retires a product by deactivating it, never by deleting it', async () => {
      const useCase = new UpdateProductUseCase(products, categories, brands);

      const retired = await useCase.execute('prod-1', { isActive: false });

      expect(retired.id).toBe('prod-1');
      expect(retired.isActive).toBe(false);
      expect(products).not.toHaveProperty('delete');
    });

    it('refuses to move a product into a category that does not exist', async () => {
      categories.findById.mockResolvedValue(null);
      const useCase = new UpdateProductUseCase(products, categories, brands);

      await expect(
        useCase.execute('prod-1', { categoryId: 'missing' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('CreateProductUseCase', () => {
    it('stores the normalized name alongside the display name', async () => {
      const useCase = new CreateProductUseCase(products, categories, brands);

      await useCase.execute({
        name: 'Leche Entera 1L',
        categoryId: 'cat-1',
        unit: UnitOfMeasure.Liter,
        packageSize: 1,
      });

      expect(products.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Leche Entera 1L',
          normalizedName: 'leche entera 1l',
        }),
      );
    });

    it('rejects a barcode that fails its checksum', async () => {
      const useCase = new CreateProductUseCase(products, categories, brands);

      await expect(
        useCase.execute({
          name: 'Leche Entera 1L',
          categoryId: 'cat-1',
          unit: UnitOfMeasure.Liter,
          barcodes: ['7790070410129'],
        }),
      ).rejects.toThrow(/valid barcode/);

      expect(products.create).not.toHaveBeenCalled();
    });

    it('refuses to give one barcode to a second product', async () => {
      products.findByBarcode.mockResolvedValue(milk);
      const useCase = new CreateProductUseCase(products, categories, brands);

      await expect(
        useCase.execute({
          name: 'Leche Descremada 1L',
          categoryId: 'cat-1',
          unit: UnitOfMeasure.Liter,
          barcodes: ['7790070410122'],
        }),
      ).rejects.toThrow(ConflictException);

      expect(products.create).not.toHaveBeenCalled();
    });

    it('marks the first barcode primary and the rest secondary', async () => {
      const useCase = new CreateProductUseCase(products, categories, brands);

      await useCase.execute({
        name: 'Leche Entera 1L',
        categoryId: 'cat-1',
        unit: UnitOfMeasure.Liter,
        barcodes: ['7790070410122', '036000291452'],
      });

      expect(products.addBarcode).toHaveBeenNthCalledWith(
        1,
        'prod-1',
        '7790070410122',
        true,
      );
      expect(products.addBarcode).toHaveBeenNthCalledWith(
        2,
        'prod-1',
        '036000291452',
        false,
      );
    });
  });
});
