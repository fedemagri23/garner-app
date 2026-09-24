import { NotFoundException } from '@nestjs/common';
import type { Category } from '../domain/product.entity.js';
import type {
  CategoryRepository,
  ProductRepository,
} from '../domain/product.repository.port.js';
import { SearchProductsUseCase } from './search-products.use-case.js';

const dairy: Category = {
  id: 'cat-1',
  name: 'Dairy',
  slug: 'dairy',
  parentId: null,
};

describe('SearchProductsUseCase', () => {
  let products: jest.Mocked<ProductRepository>;
  let categories: jest.Mocked<CategoryRepository>;
  let useCase: SearchProductsUseCase;

  beforeEach(() => {
    products = {
      search: jest.fn().mockResolvedValue({ products: [], totalItems: 0 }),
      findById: jest.fn(),
      findManyByIds: jest.fn(),
      findByBarcode: jest.fn(),
      findByNormalizedName: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      addBarcode: jest.fn(),
    };
    categories = {
      findAll: jest.fn(),
      findById: jest.fn().mockResolvedValue(dairy),
      findBySlug: jest.fn(),
      findBySlugs: jest.fn(),
      findSubtreeIds: jest.fn().mockResolvedValue(['cat-1', 'cat-2']),
      create: jest.fn(),
    };

    useCase = new SearchProductsUseCase(products, categories);
  });

  it('normalizes the search term so an unaccented query matches', async () => {
    await useCase.execute({ term: '  Serenísima ', skip: 0, take: 20 });

    expect(products.search).toHaveBeenCalledWith(
      expect.objectContaining({ term: 'serenisima' }),
    );
  });

  it('browsing a parent category includes its subcategories', async () => {
    await useCase.execute({ categoryId: 'cat-1', skip: 0, take: 20 });

    expect(products.search).toHaveBeenCalledWith(
      expect.objectContaining({ categoryIds: ['cat-1', 'cat-2'] }),
    );
  });

  it('rejects a category that does not exist rather than returning nothing', async () => {
    categories.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ categoryId: 'missing', skip: 0, take: 20 }),
    ).rejects.toThrow(NotFoundException);
  });

  it('passes no term at all when the query is blank', async () => {
    await useCase.execute({ term: '   ', skip: 0, take: 20 });

    expect(products.search).toHaveBeenCalledWith(
      expect.objectContaining({ term: undefined }),
    );
  });
});
