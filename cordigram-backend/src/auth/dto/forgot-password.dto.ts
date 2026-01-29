import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class ForgotPasswordRequestDto {
  @IsEmail()
  email!: string;
}

export class VerifyResetOtpDto {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  otp!: string;
}

export class ResetPasswordDto {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  otp!: string;

  @MinLength(8)
  newPassword!: string;
}
