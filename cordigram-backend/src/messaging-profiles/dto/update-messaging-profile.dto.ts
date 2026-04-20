import { IsOptional, IsString, MaxLength, Matches, MinLength } from 'class-validator';

const CHAT_USERNAME_REGEX = /^[a-z0-9_.]{3,30}$/;

export class UpdateMessagingProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(CHAT_USERNAME_REGEX, {
    message: 'chatUsername must be 3-30 chars: lowercase letters, digits, _, .',
  })
  chatUsername?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  pronouns?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  coverUrl?: string;

  @IsOptional()
  @IsString()
  displayNameFontId?: string | null;

  @IsOptional()
  @IsString()
  displayNameEffectId?: string | null;

  @IsOptional()
  @IsString()
  displayNamePrimaryHex?: string | null;

  @IsOptional()
  @IsString()
  displayNameAccentHex?: string | null;
}
