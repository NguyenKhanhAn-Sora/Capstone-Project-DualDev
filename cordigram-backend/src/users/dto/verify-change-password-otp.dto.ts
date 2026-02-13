import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyChangePasswordOtpDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}
