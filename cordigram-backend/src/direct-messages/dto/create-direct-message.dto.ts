import { IsString, IsArray, IsOptional, IsEnum, IsNumber } from 'class-validator';

export class CreateDirectMessageDto {
  @IsString()
  content: string;

  @IsEnum(['text', 'gif', 'sticker', 'voice'])
  @IsOptional()
  type?: 'text' | 'gif' | 'sticker' | 'voice';

  @IsString()
  @IsOptional()
  giphyId?: string;

  @IsString()
  @IsOptional()
  voiceUrl?: string;

  @IsNumber()
  @IsOptional()
  voiceDuration?: number;

  @IsArray()
  @IsOptional()
  attachments?: string[];
}

export class UpdateDirectMessageDto {
  @IsString()
  @IsOptional()
  content?: string;
}

export class MarkAsReadDto {
  @IsArray()
  messageIds: string[];
}
