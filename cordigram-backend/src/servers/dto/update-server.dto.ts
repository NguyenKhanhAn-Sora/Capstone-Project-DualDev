import { IsOptional, IsString, IsBoolean, MaxLength } from 'class-validator';

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
  @IsBoolean()
  isPublic?: boolean;
}
