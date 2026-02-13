import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CommentMediaDto {
  @IsString()
  @IsIn(['image', 'video'])
  type: 'image' | 'video';

  @IsString()
  url: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class UpdateCommentDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  content?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  mentions?: Array<
    | string
    | {
        userId?: string;
        username?: string;
      }
  >;

  @IsOptional()
  @ValidateNested()
  @Type(() => CommentMediaDto)
  media?: CommentMediaDto | null;
}
