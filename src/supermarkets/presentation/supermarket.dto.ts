import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQuery } from '../../common/http/pagination.js';
import type { OpeningInterval } from '../domain/opening-hours.js';
import type {
  NearbyStore,
  StoreLocation,
  Supermarket,
} from '../domain/supermarket.entity.js';

const WALL_CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export class SupermarketResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ nullable: true }) logoUrl!: string | null;
  @ApiProperty({ nullable: true }) websiteUrl!: string | null;
  @ApiProperty() isActive!: boolean;

  static from(supermarket: Supermarket): SupermarketResponse {
    return {
      id: supermarket.id,
      name: supermarket.name,
      slug: supermarket.slug,
      logoUrl: supermarket.logoUrl,
      websiteUrl: supermarket.websiteUrl,
      isActive: supermarket.isActive,
    };
  }
}

export class OpeningHoursResponse {
  @ApiProperty({ minimum: 0, maximum: 6, description: '0 = Sunday' })
  dayOfWeek!: number;
  @ApiProperty({ example: '09:00' }) opensAt!: string;
  @ApiProperty({ example: '21:00' }) closesAt!: string;
}

export class StoreResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) supermarketId!: string;
  @ApiProperty() supermarketName!: string;
  @ApiProperty() name!: string;
  @ApiProperty() addressLine!: string;
  @ApiProperty() city!: string;
  @ApiProperty({ nullable: true }) province!: string | null;
  @ApiProperty({ nullable: true }) postalCode!: string | null;
  @ApiProperty() country!: string;
  @ApiProperty() latitude!: number;
  @ApiProperty() longitude!: number;
  @ApiProperty({ nullable: true }) phone!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: [OpeningHoursResponse] })
  openingHours!: OpeningHoursResponse[];

  static from(store: StoreLocation): StoreResponse {
    return {
      id: store.id,
      supermarketId: store.supermarketId,
      supermarketName: store.supermarket.name,
      name: store.name,
      addressLine: store.addressLine,
      city: store.city,
      province: store.province,
      postalCode: store.postalCode,
      country: store.country,
      latitude: store.latitude,
      longitude: store.longitude,
      phone: store.phone,
      isActive: store.isActive,
      openingHours: store.openingHours,
    };
  }
}

export class NearbyStoreResponse extends StoreResponse {
  @ApiProperty({ description: 'Great-circle distance from the searched point' })
  distanceKm!: number;

  @ApiProperty({ description: 'Evaluated against the store opening hours' })
  isOpenNow!: boolean;

  static fromNearby(nearby: NearbyStore): NearbyStoreResponse {
    return {
      ...StoreResponse.from(nearby.store),
      // Metres are the useful resolution here; more decimals imply a precision
      // the stored coordinates do not have.
      distanceKm: Math.round(nearby.distanceKm * 1000) / 1000,
      isOpenNow: nearby.isOpenNow,
    };
  }
}

export class StorePageResponse {
  @ApiProperty({ type: [StoreResponse] }) data!: StoreResponse[];
  @ApiProperty() meta!: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export class NearbyStoresQueryDto {
  @ApiProperty({ example: -34.6037 })
  @Type(() => Number)
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ example: -58.3816 })
  @Type(() => Number)
  @IsLongitude()
  longitude!: number;

  @ApiPropertyOptional({ default: 5, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Max(50)
  radiusKm: number = 5;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  supermarketId?: string;
}

export class ListStoresQueryDto extends PaginationQuery {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  supermarketId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;
}

export class CreateSupermarketRequest {
  @ApiProperty({ minLength: 2, maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ format: 'uri' })
  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  logoUrl?: string;

  @ApiPropertyOptional({ format: 'uri' })
  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  websiteUrl?: string;
}

export class OpeningHoursRequest implements OpeningInterval {
  @ApiProperty({ minimum: 0, maximum: 6, description: '0 = Sunday' })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty({ example: '09:00' })
  @Matches(WALL_CLOCK, { message: 'opensAt must be an HH:MM time' })
  opensAt!: string;

  @ApiProperty({ example: '21:00' })
  @Matches(WALL_CLOCK, { message: 'closesAt must be an HH:MM time' })
  closesAt!: string;
}

export class CreateStoreRequest {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  supermarketId!: string;

  @ApiProperty({ minLength: 2, maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  addressLine!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city!: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  province?: string;

  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @ApiProperty({ maxLength: 60, example: 'AR' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  country!: string;

  @ApiProperty({ example: -34.6037 })
  @Type(() => Number)
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ example: -58.3816 })
  @Type(() => Number)
  @IsLongitude()
  longitude!: number;

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({ type: [OpeningHoursRequest], maxItems: 21 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(21)
  @ValidateNested({ each: true })
  @Type(() => OpeningHoursRequest)
  openingHours?: OpeningHoursRequest[];
}
