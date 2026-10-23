import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LookUpBarcodeUseCase } from '../application/look-up-barcode.use-case.js';
import { BarcodeLookupQuery, BarcodeLookupResponse } from './product-lookup.dto.js';

/** "What is this code?", for a shopper about to add a product. */
@ApiTags('catalog')
@ApiBearerAuth()
@Controller({ path: 'product-lookup', version: '1' })
export class ProductLookupController {
  constructor(private readonly lookUp: LookUpBarcodeUseCase) {}

  @Get(':code')
  @ApiOperation({
    summary: 'What a barcode is: in our catalog, or what Open Food Facts knows of it',
    description:
      'For filling in "Agregar producto". CATALOG: open that product instead. OPEN_FOOD_FACTS: suggested ' +
      'fields, to be checked by the shopper; credit the source. NONE also when the outside service failed.',
  })
  @ApiOkResponse({ type: BarcodeLookupResponse })
  @ApiBadRequestResponse({ description: 'Not a valid barcode' })
  async lookup(@Param('code') code: string, @Query() query: BarcodeLookupQuery): Promise<BarcodeLookupResponse> {
    return BarcodeLookupResponse.from(await this.lookUp.execute(code, query.language ?? 'es'));
  }
}
