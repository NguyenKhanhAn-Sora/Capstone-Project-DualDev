import {
  IsString,
  IsArray,
  IsOptional,
  IsEnum,
  IsNumber,
} from 'class-validator';

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

  @IsString()
  @IsOptional()
  replyTo?: string;
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

export class ReportMessageDto {
  @IsString()
  reason: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class DeleteMessageDto {
  @IsString()
  @IsOptional()
  deleteType?: 'for-everyone' | 'for-me';
}