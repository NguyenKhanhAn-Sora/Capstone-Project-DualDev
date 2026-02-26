import { IsEmail, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsEmail()
  email: string;

  @Length(4, 8)
  code: string;
}
