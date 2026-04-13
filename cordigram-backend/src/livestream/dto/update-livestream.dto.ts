import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateLivestreamDto {
  @IsOptional()
  @IsString()
  @MaxLength(2200)
  title?: string;

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
  @IsIn(['adaptive', 'balanced', 'low'])
  latencyMode?: 'adaptive' | 'balanced' | 'low';

  @IsOptional()
  @IsString()
  @MaxLength(160)
  location?: string;
}
