import { IsBoolean } from 'class-validator';

export class RequestTwoFactorOtpDto {
  @IsBoolean()
  enable: boolean;
}
