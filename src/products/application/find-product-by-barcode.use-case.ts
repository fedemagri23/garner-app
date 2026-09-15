import {
  BadRequestException,
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

/**
 * Barcode lookup is the in-store path: a shopper scans a package and expects
 * the product back. A malformed code is rejected rather than looked up,
 * because a failed checksum means the scan was misread, not that the catalog
 * is missing the product.
 */
@Injectable()
export class FindProductByBarcodeUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
  ) {}

  async execute(code: string): Promise<Product> {
    if (!isValidBarcode(code)) {
      throw new BadRequestException('Not a valid barcode');
    }

    const product = await this.products.findByBarcode(normalizeBarcode(code));

    if (!product) {
      throw new NotFoundException('No product matches this barcode');
    }

    return product;
  }
}
