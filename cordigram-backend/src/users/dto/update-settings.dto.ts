import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsIn(['light', 'dark'])
  theme?: 'light' | 'dark';

  @IsOptional()
  @IsIn(['vi', 'en', 'ja', 'zh'])
  language?: 'vi' | 'en' | 'ja' | 'zh';

  @IsOptional()
  @IsIn(['everyone', 'followers_only'])
  dmListFrom?: 'everyone' | 'followers_only';

  @IsOptional()
  @IsIn(['everyone', 'followers_only'])
  dmCallFrom?: 'everyone' | 'followers_only';

  @IsOptional()
  @IsBoolean()
  showCordigramMemberSince?: boolean;

  @IsOptional()
  @IsBoolean()
  sharePresence?: boolean;

  @IsOptional()
  @IsBoolean()
  accountBoost?: boolean;

  @IsOptional()
  @IsBoolean()
  chatSoundEnabled?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  appearanceBackground?: string;

  @IsOptional()
  @IsIn(['default', 'graphite', 'charcoal', 'indigo'])
  appearancePreset?: 'default' | 'graphite' | 'charcoal' | 'indigo';

  @IsOptional()
  @IsBoolean()
  appearanceSync?: boolean;
}
