import {
  IsOptional,
  IsString,
  IsEmail,
  IsDateString,
  MinLength,
  Matches,
} from 'class-validator';

export class CompleteProfileDto {
  @IsEmail()
  email: string;

  @IsString()
  displayName: string;

  @IsString()
  @Matches(/^[a-z0-9_\.]{3,30}$/)
  username: string;

  @IsOptional()
  @IsDateString()
  birthdate?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  avatarOriginalUrl?: string;

  @IsOptional()
  @IsString()
  avatarPublicId?: string;

  @IsOptional()
  @IsString()
  avatarOriginalPublicId?: string;

  @IsOptional()
  @IsString()
  coverUrl?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  links?: Record<string, string>;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
