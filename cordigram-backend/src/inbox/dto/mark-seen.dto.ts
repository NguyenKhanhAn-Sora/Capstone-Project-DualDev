import { IsString, IsIn } from 'class-validator';

export class MarkSeenDto {
  @IsString()
  @IsIn(['event', 'server_invite', 'server_notification', 'channel_mention'])
  sourceType: string;

  @IsString()
  sourceId: string;
}
