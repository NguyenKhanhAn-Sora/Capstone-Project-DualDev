import { IsNotEmpty, IsString } from 'class-validator';

export class RequestPasskeyOtpDto {
  @IsString()
  @IsNotEmpty()
  password!: string;
}
