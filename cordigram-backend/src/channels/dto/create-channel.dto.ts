import { IsString, IsEnum, IsOptional, MinLength, MaxLength } from 'class-validator';

export class CreateChannelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsEnum(['text', 'voice'])
  type: 'text' | 'voice';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
