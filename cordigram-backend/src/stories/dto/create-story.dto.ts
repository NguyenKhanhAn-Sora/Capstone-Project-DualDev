import { IsString, IsOptional, IsEnum, IsArray, ValidateNested, IsNumber, IsIn, Max, Min, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { StoryVisibility } from '../story.schema';

export class TextOverlayDto {
  @IsString()
  text: string;

  @IsOptional() @IsString()
  color?: string;

  @IsOptional() @IsString()
  backgroundColor?: string;

  @IsOptional() @IsNumber()
  fontSize?: number;

  @IsOptional() @IsIn(['left', 'center', 'right'])
  align?: 'left' | 'center' | 'right';

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  x?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  y?: number;
}

export class StickerDto {
  @IsString()
  emoji: string;

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  x?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  y?: number;

  @IsOptional() @IsNumber() @Min(10) @Max(120)
  size?: number;
}

export class MusicDto {
  @IsString()
  trackId: string;

  @IsString()
  title: string;

  @IsString()
  artist: string;

  @IsString()
  coverUrl: string;

  @IsString()
  audioUrl: string;

  @IsOptional() @IsNumber() @Min(0)
  startTime?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  stickerX?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  stickerY?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  stickerWidth?: number;
}

export class CreateStoryDto {
  @IsOptional() @IsEnum(['media', 'text'])
  type?: 'media' | 'text';

  @IsOptional() @IsEnum(['image', 'video'])
  mediaType?: 'image' | 'video';

  @IsOptional() @IsString()
  mediaUrl?: string;

  @IsOptional() @IsNumber()
  mediaDurationMs?: number;

  @IsOptional() @IsNumber() @Min(0)
  trimStartMs?: number;

  @IsOptional() @IsNumber() @Min(0)
  trimEndMs?: number;

  @IsOptional() @IsString()
  textContent?: string;

  @IsOptional() @IsString()
  backgroundStyle?: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TextOverlayDto)
  textOverlays?: TextOverlayDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => StickerDto)
  stickers?: StickerDto[];

  @IsOptional() @IsEnum(['public', 'followers', 'private'])
  visibility?: StoryVisibility;

  @IsOptional() @IsString()
  location?: string;

  @IsOptional() @ValidateNested() @Type(() => MusicDto)
  music?: MusicDto;
}
