import { IsString, IsMongoId } from 'class-validator';

export class CreateServerInviteDto {
  @IsString()
  @IsMongoId()
  toUserId: string;

  @IsString()
  @IsMongoId()
  serverId: string;
}
