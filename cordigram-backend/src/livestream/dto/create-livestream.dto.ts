import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateLivestreamDto {
  @IsString()
  @MinLength(3)
  @MaxLength(2200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  pinnedComment?: string;

  @IsOptional()
  @IsString()
  @IsIn(['public', 'followers', 'private'])
  visibility?: 'public' | 'followers' | 'private';

  @IsOptional()
  @IsString()
  @IsIn(['adaptive', 'balanced', 'low'])
  latencyMode?: 'adaptive' | 'balanced' | 'low';

  @IsOptional()
  @IsString()
  @MaxLength(160)
  location?: string;

  @IsOptional()
  mentions?: string[];
}
