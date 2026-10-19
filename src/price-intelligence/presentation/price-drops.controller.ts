import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FindNearbyPriceDropsUseCase } from '../application/find-nearby-price-drops.use-case.js';
import {
  NearbyPriceDropsQueryDto,
  PriceDropResponse,
} from './price-intelligence.dto.js';

/** Recent price falls around a shopper, for the home screen. */
@ApiTags('prices')
@ApiBearerAuth()
@Controller({ path: 'price-drops', version: '1' })
export class PriceDropsController {
  constructor(private readonly findNearby: FindNearbyPriceDropsUseCase) {}

  @Get()
  @ApiOperation({
    summary: 'Products whose price fell this week near a point, biggest fall first',
  })
  @ApiOkResponse({ type: [PriceDropResponse] })
  async nearby(
    @Query() query: NearbyPriceDropsQueryDto,
  ): Promise<PriceDropResponse[]> {
    const drops = await this.findNearby.execute(query);
    return drops.map(PriceDropResponse.from);
  }
}
