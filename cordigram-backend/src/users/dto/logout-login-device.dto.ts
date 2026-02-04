import { IsNotEmpty, IsString } from 'class-validator';

export class LogoutLoginDeviceDto {
  @IsString()
  @IsNotEmpty()
  deviceIdHash: string;
}
