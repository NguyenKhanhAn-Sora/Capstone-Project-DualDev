import {
  IsOptional,
  IsString,
  IsBoolean,
  MaxLength,
  IsArray,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

class UpdateServerTraitDto {
  @IsOptional()
  @IsString()
  @MaxLength(8)
  emoji?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  text?: string;
}

export class UpdateServerDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsString()
  avatarUrl?: string | null;

  @IsOptional()
  @IsString()
  bannerUrl?: string | null;

  @IsOptional()
  @IsString()
  bannerImageUrl?: string | null;

  @IsOptional()
  @IsString()
  bannerColor?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateServerTraitDto)
  profileTraits?: UpdateServerTraitDto[];

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsObject()
  safetySettings?: Record<string, any>;
}
