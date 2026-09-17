import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQuery } from '../../common/http/pagination.js';
import type {
  PriceObservation,
  PriceObservationStatus,
  PriceSourceType,
} from '../../pricing/domain/price-observation.entity.js';
import { MAX_PRICE_CENTS } from '../../pricing/domain/price-plausibility.js';
import { MAX_EVIDENCE_NOTE_LENGTH } from '../domain/evidence.js';

const SOURCE_TYPES: PriceSourceType[] = [
  'USER_REPORTED',
  'USER_WITH_EVIDENCE',
  'PURCHASE_CONFIRMED',
  'EXTERNAL_API',
];

/**
 * The status a contributor sees. FLAGGED is shown as UNDER_REVIEW, and the
 * internal reasons are never returned: they describe the abuse heuristics.
 */
export type ContributionStatus = 'ACCEPTED' | 'UNDER_REVIEW' | 'REJECTED';

const PUBLIC_STATUS: Record<PriceObservationStatus, ContributionStatus> = {
  ACCEPTED: 'ACCEPTED',
  FLAGGED: 'UNDER_REVIEW',
  REJECTED: 'REJECTED',
};

export class ContributionResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty({ format: 'uuid' }) storeId!: string;
  @ApiProperty({ description: 'Price of one unit, in minor units (cents)' })
  priceCents!: number;
  @ApiProperty({ example: 'ARS' }) currency!: string;
  @ApiProperty({ format: 'date-time' }) observedAt!: string;
  @ApiProperty({ format: 'date-time' }) receivedAt!: string;
  @ApiProperty({ enum: SOURCE_TYPES }) sourceType!: PriceSourceType;
  @ApiProperty({
    enum: ['ACCEPTED', 'UNDER_REVIEW', 'REJECTED'],
    description:
      'UNDER_REVIEW prices are kept but do not affect shown prices until confirmed',
  })
  status!: ContributionStatus;
  @ApiProperty() hasPhotoEvidence!: boolean;
  @ApiProperty({ nullable: true }) note!: string | null;

  static from(observation: PriceObservation): ContributionResponse {
    return {
      id: observation.id,
      productId: observation.productId,
      storeId: observation.storeId,
      priceCents: observation.priceCents,
      currency: observation.currency,
      observedAt: observation.observedAt.toISOString(),
      receivedAt: observation.receivedAt.toISOString(),
      sourceType: observation.sourceType,
      status: PUBLIC_STATUS[observation.status],
      hasPhotoEvidence: observation.evidencePhotoKey !== null,
      note: observation.evidenceNote,
    };
  }
}

export class ContributionPageResponse {
  @ApiProperty({ type: [ContributionResponse] }) data!: ContributionResponse[];
  @ApiProperty() meta!: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export class ListContributionsQueryDto extends PaginationQuery {}

export class PriceEvidenceRequest {
  @ApiPropertyOptional({
    description: 'Key returned by POST /v1/price-evidence for a photo you uploaded',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  photoKey?: string;

  @ApiPropertyOptional({ maxLength: MAX_EVIDENCE_NOTE_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_EVIDENCE_NOTE_LENGTH)
  note?: string;
}

export class ReportPriceRequest {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Optional client-generated id. Retrying with the same id returns the ' +
      'report already stored.',
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  storeId!: string;

  @ApiProperty({ description: 'Price of one unit, in minor units (cents)', example: 125 })
  @IsInt()
  @Min(1)
  @Max(MAX_PRICE_CENTS)
  priceCents!: number;

  @ApiProperty({ example: 'ARS' })
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be an ISO 4217 code' })
  currency!: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'When the price was seen; defaults to now. At most 7 days old.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  observedAt?: Date;

  @ApiPropertyOptional({ type: PriceEvidenceRequest })
  @IsOptional()
  @ValidateNested()
  @Type(() => PriceEvidenceRequest)
  evidence?: PriceEvidenceRequest;
}

export class EvidenceUploadResponse {
  @ApiProperty({ description: 'Pass as evidence.photoKey when reporting a price' })
  photoKey!: string;
}
