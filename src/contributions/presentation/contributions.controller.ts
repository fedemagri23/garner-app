import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { paginate } from '../../common/http/pagination.js';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import { CurrentUser } from '../../security/presentation/current-user.decorator.js';
import { ListMyContributionsUseCase } from '../application/list-my-contributions.use-case.js';
import { ReportPriceUseCase } from '../application/report-price.use-case.js';
import { MAX_EVIDENCE_BYTES } from '../domain/evidence.js';
import {
  ContributionPageResponse,
  ContributionResponse,
  EvidenceUploadResponse,
  ListContributionsQueryDto,
  ReportPriceRequest,
} from './contribution.dto.js';

/** The part of an uploaded file this controller reads. */
interface UploadedPhoto {
  buffer: Buffer;
  size: number;
}

@ApiTags('contributions')
@ApiBearerAuth()
@Controller({ version: '1' })
export class ContributionsController {
  constructor(
    private readonly reportPrice: ReportPriceUseCase,
    private readonly listContributions: ListMyContributionsUseCase,
  ) {}

  @Post('price-observations')
  @ApiOperation({ summary: 'Report a price seen at a store' })
  @ApiCreatedResponse({ type: ContributionResponse })
  @ApiBadRequestResponse({ description: 'Not a plausible price' })
  @ApiUnprocessableEntityResponse({
    description: 'Retired product, inactive store, or evidence not found',
  })
  @ApiTooManyRequestsResponse({ description: 'Too many reports' })
  async report(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: ReportPriceRequest,
    @Req() request: Request,
  ): Promise<ContributionResponse> {
    const { observation } = await this.reportPrice.report(
      actor,
      body,
      request.ip ?? null,
    );

    return ContributionResponse.from(observation);
  }

  @Get('price-observations/mine')
  @ApiOperation({ summary: 'List the prices I have contributed' })
  @ApiOkResponse({ type: ContributionPageResponse })
  async mine(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListContributionsQueryDto,
  ): Promise<ContributionPageResponse> {
    const { observations, totalItems } = await this.listContributions.execute(
      actor,
      { skip: query.skip, take: query.take },
    );

    return paginate(
      observations.map(ContributionResponse.from),
      totalItems,
      query,
    );
  }

  @Post('price-evidence')
  @UseInterceptors(
    // Limited in the parser as well as the use case, so an oversized upload is
    // cut off while streaming instead of being buffered whole first.
    FileInterceptor('photo', { limits: { fileSize: MAX_EVIDENCE_BYTES, files: 1 } }),
  )
  @ApiOperation({ summary: 'Upload a photo to attach to a price report' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['photo'],
      properties: { photo: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ type: EvidenceUploadResponse })
  @ApiUnprocessableEntityResponse({ description: 'Not a JPEG, PNG or WebP image' })
  async uploadEvidence(
    @CurrentUser() actor: AuthenticatedUser,
    @UploadedFile() photo: UploadedPhoto | undefined,
  ): Promise<EvidenceUploadResponse> {
    return {
      photoKey: await this.reportPrice.uploadEvidence(actor, photo?.buffer),
    };
  }
}
