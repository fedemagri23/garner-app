import { Inject, Injectable } from '@nestjs/common';
import { normalizeText } from '../../common/text/normalize.js';
import {
  COMMUNITY_REPOSITORY,
  type CommunityRepository,
  type SimilarProduct,
} from '../domain/community.port.js';

/**
 * "Is it one of these?": before a shopper adds a product, the ones already in
 * the catalog with a name like it, best known first. Asking first is what
 * keeps the catalog from filling with near-copies.
 */
@Injectable()
export class SuggestProductsUseCase {
  constructor(
    @Inject(COMMUNITY_REPOSITORY) private readonly community: CommunityRepository,
  ) {}

  execute(name: string, limit = 8): Promise<SimilarProduct[]> {
    const text = normalizeText(name);
    return text.length < 2 ? Promise.resolve([]) : this.community.productsLike(text, limit);
  }
}
