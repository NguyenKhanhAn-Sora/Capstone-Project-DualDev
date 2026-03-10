import { IsString, IsIn } from 'class-validator';

export class MarkSeenDto {
  @IsString()
  @IsIn(['event', 'server_invite'])
  sourceType: string;

  @IsString()
  sourceId: string;
}
