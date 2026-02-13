import { IsNotEmpty, IsString, Matches } from 'class-validator';

const PASSKEY_REGEX = /^\d{6}$/;

export class VerifyPasskeyDeviceDto {
  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(PASSKEY_REGEX)
  passkey!: string;
}
