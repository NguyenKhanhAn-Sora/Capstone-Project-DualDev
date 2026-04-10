import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AddServerEmojiDto {
  @IsString()
  @MinLength(8)
  @MaxLength(2000)
  imageUrl: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;
}
