import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class TwoFactorVerifyDto {
  @IsString()
  token: string;

  @IsString()
  @Length(4, 8)
  code: string;

  @IsOptional()
  @IsBoolean()
  trustDevice?: boolean;
}

export class TwoFactorResendDto {
  @IsString()
  token: string;
}
