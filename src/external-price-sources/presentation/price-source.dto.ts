import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQuery } from '../../common/http/pagination.js';
import {
  ExternalProductLinkStatus,
  ImportRunStatus,
  ProductMatchMethod,
  type ExternalPriceSource,
  type ExternalProductLink,
  type ImportRun,
} from '../domain/external-price-source.entity.js';

const RUN_STATUSES = Object.values(ImportRunStatus);
const LINK_STATUSES = Object.values(ExternalProductLinkStatus);
const MATCH_METHODS = Object.values(ProductMatchMethod);

export class PriceSourceResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ format: 'uuid' }) supermarketId!: string;
  @ApiProperty({ example: 'json-http' }) adapterKey!: string;
  @ApiProperty() isEnabled!: boolean;
  @ApiProperty({ minimum: 0, maximum: 23 }) scheduleHourUtc!: number;
  @ApiProperty({
    type: Object,
    description: 'Adapter configuration; credentials are never stored here',
  })
  config!: Record<string, unknown>;
  @ApiProperty({ format: 'date-time', nullable: true })
  lastRunAt!: string | null;
  @ApiProperty({ format: 'date-time', nullable: true })
  lastSuccessfulRunAt!: string | null;
  @ApiProperty({ enum: RUN_STATUSES, nullable: true })
  lastStatus!: ImportRunStatus | null;
  @ApiProperty({ description: 'Runs that failed outright since the last good one' })
  consecutiveFailures!: number;

  static from(source: ExternalPriceSource): PriceSourceResponse {
    return {
      id: source.id,
      name: source.name,
      slug: source.slug,
      supermarketId: source.supermarketId,
      adapterKey: source.adapterKey,
      isEnabled: source.isEnabled,
      scheduleHourUtc: source.scheduleHourUtc,
      config: source.config,
      lastRunAt: source.lastRunAt?.toISOString() ?? null,
      lastSuccessfulRunAt: source.lastSuccessfulRunAt?.toISOString() ?? null,
      lastStatus: source.lastStatus,
      consecutiveFailures: source.consecutiveFailures,
    };
  }
}

export class ImportRunResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: '2026-09-24', description: 'The daily slot this run served' })
  runKey!: string;
  @ApiProperty({ enum: RUN_STATUSES }) status!: ImportRunStatus;
  @ApiProperty({ format: 'date-time' }) startedAt!: string;
  @ApiProperty({ format: 'date-time', nullable: true }) finishedAt!: string | null;
  @ApiProperty() productsSeen!: number;
  @ApiProperty() pricesSeen!: number;
  @ApiProperty() observationsCreated!: number;
  @ApiProperty() matchedProducts!: number;
  @ApiProperty({ description: 'Products awaiting a person’s decision' })
  unmatchedProducts!: number;
  @ApiProperty({ description: 'Prices that could not be placed or failed validation' })
  skippedPrices!: number;
  @ApiProperty({ nullable: true }) error!: string | null;

  static from(run: ImportRun): ImportRunResponse {
    return {
      id: run.id,
      runKey: run.runKey,
      status: run.status,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      productsSeen: run.productsSeen,
      pricesSeen: run.pricesSeen,
      observationsCreated: run.observationsCreated,
      matchedProducts: run.matchedProducts,
      unmatchedProducts: run.unmatchedProducts,
      skippedPrices: run.skippedPrices,
      error: run.error,
    };
  }
}

export class ExternalProductLinkResponse {
  @ApiProperty() externalProductId!: string;
  @ApiProperty() externalName!: string;
  @ApiProperty({ nullable: true }) externalBarcode!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) productId!: string | null;
  @ApiProperty({ enum: MATCH_METHODS, nullable: true })
  matchMethod!: ProductMatchMethod | null;
  @ApiProperty({ enum: LINK_STATUSES }) status!: ExternalProductLinkStatus;
  @ApiProperty({ format: 'date-time' }) lastSeenAt!: string;

  static from(link: ExternalProductLink): ExternalProductLinkResponse {
    return {
      externalProductId: link.externalProductId,
      externalName: link.externalName,
      externalBarcode: link.externalBarcode,
      productId: link.productId,
      matchMethod: link.matchMethod,
      status: link.status,
      lastSeenAt: link.lastSeenAt.toISOString(),
    };
  }
}

export class ExternalProductLinkPageResponse {
  @ApiProperty({ type: [ExternalProductLinkResponse] })
  data!: ExternalProductLinkResponse[];
  @ApiProperty() meta!: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export class CreatePriceSourceRequest {
  @ApiProperty({ minLength: 2, maxLength: 120, example: 'Coto API' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ format: 'uuid', description: 'The supermarket this source prices' })
  @IsUUID()
  supermarketId!: string;

  @ApiProperty({ example: 'json-http' })
  @IsString()
  @MaxLength(60)
  adapterKey!: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 23, default: 8 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  scheduleHourUtc?: number;

  @ApiPropertyOptional({
    type: Object,
    description: 'Adapter configuration. Never put credentials here.',
  })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class UpdatePriceSourceRequest {
  @ApiPropertyOptional({ minLength: 2, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 23 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  scheduleHourUtc?: number;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class ListLinksQueryDto extends PaginationQuery {
  @ApiPropertyOptional({ enum: LINK_STATUSES, default: 'UNMATCHED' })
  @IsOptional()
  @IsString()
  status: ExternalProductLinkStatus = ExternalProductLinkStatus.Unmatched;
}

export class ResolveLinkRequest {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'The canonical product this is. Omit with ignore: true.',
  })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({
    description: 'Mark as having no canonical counterpart',
  })
  @IsOptional()
  @IsBoolean()
  ignore?: boolean;
}

export class LinkStoreRequest {
  @ApiProperty({ description: 'What the source calls the branch' })
  @IsString()
  @MaxLength(120)
  externalStoreId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  storeId!: string;
}

export class AdaptersResponse {
  @ApiProperty({ type: [String], description: 'Adapter keys this deployment can run' })
  adapters!: string[];
}
