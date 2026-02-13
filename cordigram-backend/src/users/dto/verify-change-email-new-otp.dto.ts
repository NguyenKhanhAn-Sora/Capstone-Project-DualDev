import { IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyChangeEmailNewOtpDto {
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  code!: string;
}
