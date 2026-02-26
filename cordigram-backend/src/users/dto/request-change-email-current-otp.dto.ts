import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RequestChangeEmailCurrentOtpDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password!: string;
}
