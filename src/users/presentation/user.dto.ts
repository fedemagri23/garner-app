import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { UserRole } from '../../security/domain/user-role.js';
import {
  MAX_SEARCH_RADIUS_KM,
  type UserPreferences,
} from '../domain/user-preferences.entity.js';
import type { User } from '../domain/user.entity.js';

/** Response shape for a user. Never includes credentials. */
export class UserResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty({ enum: Object.values(UserRole) })
  role!: UserRole;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  static from(user: User): UserResponse {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
    };
  }
}

export class UpdateUserProfileRequest {
  @ApiPropertyOptional({ minLength: 1, maxLength: 80 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName?: string;
}

export class UserPreferencesResponse {
  @ApiProperty({ nullable: true }) latitude!: number | null;
  @ApiProperty({ nullable: true }) longitude!: number | null;
  @ApiProperty({ nullable: true }) locationLabel!: string | null;
  @ApiProperty() searchRadiusKm!: number;
  @ApiProperty({ type: [String], description: 'Category slugs' })
  interests!: string[];

  static from(preferences: UserPreferences): UserPreferencesResponse {
    return {
      latitude: preferences.latitude,
      longitude: preferences.longitude,
      locationLabel: preferences.locationLabel,
      searchRadiusKm: preferences.searchRadiusKm,
      interests: preferences.interests,
    };
  }
}

/**
 * Every field is optional and nullable: onboarding is skippable, so a user has
 * to be able to set a location later and clear it again.
 */
export class UpdateUserPreferencesRequest {
  @ApiPropertyOptional({ nullable: true, example: -34.6037 })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @Type(() => Number)
  @IsLatitude()
  latitude?: number | null;

  @ApiPropertyOptional({ nullable: true, example: -58.3816 })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @Type(() => Number)
  @IsLongitude()
  longitude?: number | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(120)
  locationLabel?: string | null;

  @ApiPropertyOptional({ maximum: MAX_SEARCH_RADIUS_KM })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Max(MAX_SEARCH_RADIUS_KM)
  searchRadiusKm?: number;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 30,
    description: 'Category slugs, validated against the catalog',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @Matches(/^[a-z0-9-]+$/, {
    each: true,
    message: 'each interest must be a category slug',
  })
  interests?: string[];
}
