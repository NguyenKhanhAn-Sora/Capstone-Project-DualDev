import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

const PASSKEY_REGEX = /^\d{6}$/;

export class ConfirmPasskeyDto {
  @IsOptional()
  @IsString()
  @Matches(PASSKEY_REGEX)
  currentPasskey?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(PASSKEY_REGEX)
  newPasskey!: string;
}
