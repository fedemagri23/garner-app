import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterRequest {
  @ApiProperty({ format: 'email', maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 10, maxLength: 128 })
  @IsString()
  // Upper bound as well as lower: an unbounded password is an easy way to make
  // the server do expensive hashing work on request.
  @MinLength(10)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ minLength: 1, maxLength: 80 })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName!: string;
}

export class LoginRequest {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  password!: string;
}

export class RefreshRequest {
  @ApiProperty()
  @IsString()
  @MaxLength(512)
  refreshToken!: string;
}

export class TokenPairResponse {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({
    description: 'Seconds until the access token expires; refresh a little before',
    example: 900,
  })
  accessTokenExpiresIn!: number;

  @ApiProperty()
  refreshToken!: string;
}

export class PasswordResetRequest {
  @ApiProperty({ format: 'email', maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class PasswordResetConfirmRequest {
  @ApiProperty({ format: 'email', maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: '042137', description: 'The six digits from the email' })
  @IsString()
  @Matches(/^\s*\d{6}\s*$/, { message: 'code must be six digits' })
  code!: string;

  @ApiProperty({ minLength: 10, maxLength: 128 })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  newPassword!: string;
}
