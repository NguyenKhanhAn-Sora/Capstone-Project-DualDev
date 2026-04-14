import {
  IsString,
  IsOptional,
  IsArray,
  IsIn,
  IsNumber,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content: string;

  @IsOptional()
  @IsArray()
  attachments?: string[];

  @IsOptional()
  @IsString()
  replyTo?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentions?: string[];

  @IsOptional()
  @IsString()
  @IsIn(['text', 'gif', 'sticker', 'voice'])
  messageType?: string;

  @IsOptional()
  @IsString()
  giphyId?: string;

  @IsOptional()
  @IsString()
  customStickerUrl?: string;

  @IsOptional()
  @IsString()
  serverStickerId?: string;

  @IsOptional()
  @IsString()
  voiceUrl?: string;

  @IsOptional()
  @IsNumber()
  voiceDuration?: number;
}
