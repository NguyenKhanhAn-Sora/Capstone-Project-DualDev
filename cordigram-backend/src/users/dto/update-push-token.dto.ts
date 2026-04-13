import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePushTokenDto {
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  token?: string | null;
}
