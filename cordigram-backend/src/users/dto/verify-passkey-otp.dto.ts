import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyPasskeyOtpDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}
