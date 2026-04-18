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

  /**
   * Server ID chứa sticker (khi dùng sticker cross-server).
   * Nếu không truyền thì mặc định là server của kênh hiện tại.
   */
  @IsOptional()
  @IsString()
  serverStickerServerId?: string;

  @IsOptional()
  @IsString()
  voiceUrl?: string;

  @IsOptional()
  @IsNumber()
  voiceDuration?: number;
}
