import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isValidBarcode, normalizeBarcode } from '../domain/barcode.js';
import type { Product } from '../domain/product.entity.js';
import {
  PRODUCT_REPOSITORY,
  type ProductRepository,
} from '../domain/product.repository.port.js';

@Injectable()
export class AddProductBarcodeUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
  ) {}

  async execute(
    productId: string,
    code: string,
    isPrimary = false,
  ): Promise<Product> {
    if (!isValidBarcode(code)) {
      throw new BadRequestException('Not a valid barcode');
    }

    const product = await this.products.findById(productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const updated = await this.products.addBarcode(
      productId,
      normalizeBarcode(code),
      isPrimary,
    );

    if (!updated) {
      throw new ConflictException('Barcode already belongs to another product');
    }

    return updated;
  }
}
