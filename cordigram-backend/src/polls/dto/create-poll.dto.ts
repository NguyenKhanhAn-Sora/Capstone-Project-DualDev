import { IsString, IsArray, IsNumber, IsBoolean, IsOptional, MaxLength, ArrayMinSize, Min, Max } from 'class-validator';

export class CreatePollDto {
  @IsString()
  @MaxLength(300, { message: 'Question must be less than 300 characters' })
  question: string;

  @IsArray()
  @ArrayMinSize(2, { message: 'Poll must have at least 2 options' })
  @IsString({ each: true })
  options: string[];

  @IsNumber()
  @Min(1, { message: 'Duration must be at least 1 hour' })
  @Max(168, { message: 'Duration must be at most 7 days (168 hours)' })
  @IsOptional()
  durationHours?: number;

  @IsBoolean()
  @IsOptional()
  allowMultipleAnswers?: boolean;
}

export class VotePollDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Must select at least one option' })
  @IsNumber({}, { each: true })
  optionIndexes: number[];
}
