import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Supermarket } from '../domain/supermarket.entity.js';
import {
  SUPERMARKET_REPOSITORY,
  type SupermarketRepository,
} from '../domain/supermarket.repository.port.js';

@Injectable()
export class BrowseSupermarketsUseCase {
  constructor(
    @Inject(SUPERMARKET_REPOSITORY)
    private readonly supermarkets: SupermarketRepository,
  ) {}

  list(): Promise<Supermarket[]> {
    return this.supermarkets.findAll(false);
  }

  async get(id: string): Promise<Supermarket> {
    const supermarket = await this.supermarkets.findById(id);

    if (!supermarket) {
      throw new NotFoundException('Supermarket not found');
    }

    return supermarket;
  }
}
