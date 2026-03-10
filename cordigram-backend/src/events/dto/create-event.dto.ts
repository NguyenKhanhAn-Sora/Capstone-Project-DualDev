import {
  IsString,
  IsEnum,
  IsOptional,
  IsDateString,
  MinLength,
  MaxLength,
  IsMongoId,
} from 'class-validator';
import { Transform } from 'class-transformer';

export type EventFrequencyDto =
  | 'none'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'yearly';

export type EventLocationTypeDto = 'voice' | 'other';

function trimOrUndefined(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s === '' ? undefined : s;
}

export class CreateEventDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  topic: string;

  @IsDateString()
  startAt: string;

  @IsOptional()
  @Transform(({ value }) => trimOrUndefined(value))
  @IsDateString()
  endAt?: string;

  @IsEnum(['none', 'weekly', 'biweekly', 'monthly', 'yearly'])
  frequency: EventFrequencyDto;

  @IsEnum(['voice', 'other'])
  locationType: EventLocationTypeDto;

  @IsOptional()
  @Transform(({ value }) => trimOrUndefined(value))
  @IsMongoId()
  channelId?: string;

  @IsOptional()
  @Transform(({ value }) => trimOrUndefined(value))
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @Transform(({ value }) => trimOrUndefined(value))
  @IsString()
  coverImageUrl?: string;
}
