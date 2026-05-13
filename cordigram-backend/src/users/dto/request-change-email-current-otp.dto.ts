import { IsOptional, IsString } from 'class-validator';

export class RequestChangeEmailCurrentOtpDto {
  @IsOptional()
  @IsString()
  password?: string;
}
