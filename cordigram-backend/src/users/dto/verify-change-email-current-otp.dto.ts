import { IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyChangeEmailCurrentOtpDto {
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  code!: string;
}
