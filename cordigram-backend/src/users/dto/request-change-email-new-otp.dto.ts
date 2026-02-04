import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class RequestChangeEmailNewOtpDto {
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  newEmail!: string;
}
