import { IsOptional, IsString } from 'class-validator';

export class RequestPasskeyOtpDto {
  @IsOptional()
  @IsString()
  password?: string;
}
