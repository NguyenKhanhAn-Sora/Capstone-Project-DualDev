import { IsIn, IsOptional } from 'class-validator';
import {
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '../language.constants';

export class UpdateSettingsDto {
  @IsOptional()
  @IsIn(['light', 'dark'])
  theme?: 'light' | 'dark';

  @IsOptional()
  @IsIn(SUPPORTED_LANGUAGES as unknown as string[])
  language?: SupportedLanguage;
}
