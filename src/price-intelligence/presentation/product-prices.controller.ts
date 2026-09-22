import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ComparePricesUseCase } from '../application/compare-prices.use-case.js';
import { GetPriceHistoryUseCase } from '../application/get-price-history.use-case.js';
import {
  ComparePricesQueryDto,
  PriceComparisonResponse,
  PriceHistoryQueryDto,
  PriceHistoryResponse,
} from './price-intelligence.dto.js';

/**
 * The read side of price intelligence: what a product costs now, and what it
 * has cost. Both answers come from derived data — never from raw observations,
 * which expire.
 */
@ApiTags('prices')
@ApiBearerAuth()
@Controller({ path: 'products/:id/prices', version: '1' })
export class ProductPricesController {
  constructor(
    private readonly comparePrices: ComparePricesUseCase,
    private readonly priceHistory: GetPriceHistoryUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Compare a product’s current prices by store' })
  @ApiOkResponse({ type: PriceComparisonResponse })
  @ApiNotFoundResponse({ description: 'Product not found' })
  async compare(
    @Param('id', ParseUUIDPipe) productId: string,
    @Query() query: ComparePricesQueryDto,
  ): Promise<PriceComparisonResponse> {
    // Half a coordinate cannot place a search, and silently ignoring it would
    // quietly return prices from the whole country.
    if ((query.latitude === undefined) !== (query.longitude === undefined)) {
      throw new BadRequestException(
        'latitude and longitude must be given together',
      );
    }

    return PriceComparisonResponse.from(
      await this.comparePrices.execute({ productId, ...query }),
    );
  }

  @Get('history')
  @ApiOperation({ summary: 'Daily price history and its trend' })
  @ApiOkResponse({ type: PriceHistoryResponse })
  @ApiNotFoundResponse({ description: 'Product not found' })
  async history(
    @Param('id', ParseUUIDPipe) productId: string,
    @Query() query: PriceHistoryQueryDto,
  ): Promise<PriceHistoryResponse> {
    return PriceHistoryResponse.from(
      await this.priceHistory.execute({
        productId,
        storeId: query.storeId,
        range: query.range,
      }),
    );
  }
}
