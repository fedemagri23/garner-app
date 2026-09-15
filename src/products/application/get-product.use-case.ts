import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Product } from '../domain/product.entity.js';
import {
  PRODUCT_REPOSITORY,
  type ProductRepository,
} from '../domain/product.repository.port.js';

@Injectable()
export class GetProductUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
  ) {}

  async execute(id: string): Promise<Product> {
    const product = await this.products.findById(id);

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }
}
