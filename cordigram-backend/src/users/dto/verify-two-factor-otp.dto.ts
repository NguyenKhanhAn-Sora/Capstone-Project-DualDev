import { IsBoolean, IsString, Length } from 'class-validator';

export class VerifyTwoFactorOtpDto {
  @IsString()
  @Length(4, 8)
  code: string;

  @IsBoolean()
  enable: boolean;
}
