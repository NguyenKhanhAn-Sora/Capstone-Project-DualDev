import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CompanySuggestQueryDto {
  @IsString()
  @MaxLength(120)
  q: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(25)
  limit?: number;
}
