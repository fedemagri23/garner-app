import { LANGUAGES } from '../../common/i18n/language.js';
import type { ProductFacts, ProductFactsSource } from '../domain/product-facts.js';

const TIMEOUT_MS = 3_000;
/** Their published limit for product reads is 100 a minute; stay under it. */
const MAX_PER_MINUTE = 90;
const FIELDS = [
  'product_name',
  ...LANGUAGES.map((language) => `product_name_${language}`),
  'brands',
  'quantity',
  'categories_tags',
  'image_front_url',
];

interface OffProduct {
  product_name?: string;
  brands?: string;
  quantity?: string;
  categories_tags?: string[];
  image_front_url?: string;
  [name: `product_name_${string}`]: string | undefined;
}

/**
 * Open Food Facts (openfoodfacts.org), an open database of food products by
 * barcode. Asked from the server only, identifying itself as they require,
 * within their rate limit, and quickly: a slow answer is worse than none for
 * a shopper standing in an aisle.
 */
export class OpenFoodFactsSource implements ProductFactsSource {
  private readonly recent: number[] = [];

  constructor(
    private readonly baseUrl: string,
    private readonly userAgent: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async find(code: string): Promise<ProductFacts | null> {
    this.takeTurn();
    const url = `${this.baseUrl.replace(/\/$/, '')}/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS.join(',')}`;
    const response = await this.fetchImpl(url, {
      headers: { accept: 'application/json', 'user-agent': this.userAgent },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Open Food Facts answered ${response.status}`);

    const body = (await response.json()) as { status?: number; product?: OffProduct };
    if (body.status !== 1 || !body.product) return null;
    return toFacts(code, body.product);
  }

  /** Refuses rather than exceed their limit; the caller then suggests nothing. */
  private takeTurn(): void {
    const minuteAgo = this.now() - 60_000;
    while (this.recent.length > 0 && this.recent[0] < minuteAgo) this.recent.shift();
    if (this.recent.length >= MAX_PER_MINUTE) throw new Error('Open Food Facts rate limit reached');
    this.recent.push(this.now());
  }
}

function toFacts(code: string, product: OffProduct): ProductFacts | null {
  const names: ProductFacts['names'] = {};
  if (product.product_name?.trim()) names.default = product.product_name.trim();
  for (const language of LANGUAGES) {
    const name = product[`product_name_${language}`]?.trim();
    if (name) names[language] = name;
  }
  // A code they hold with no name is of no help in a form.
  if (Object.keys(names).length === 0) return null;

  return {
    code,
    names,
    brands: (product.brands ?? '').split(',').map((brand) => brand.trim()).filter(Boolean),
    quantity: product.quantity?.trim() || null,
    categoryTags: product.categories_tags ?? [],
    imageUrl: product.image_front_url?.startsWith('https://') ? product.image_front_url : null,
  };
}
