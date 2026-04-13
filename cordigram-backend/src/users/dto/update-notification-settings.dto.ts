import { IsBoolean, IsIn, IsISO8601, IsOptional } from 'class-validator';

const NOTIFICATION_CATEGORY_KEYS = [
  'follow',
  'comment',
  'like',
  'mentions',
  'system',
] as const;

export class UpdateNotificationSettingsDto {
  @IsOptional()
  @IsIn(NOTIFICATION_CATEGORY_KEYS)
  category?: (typeof NOTIFICATION_CATEGORY_KEYS)[number];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  mutedIndefinitely?: boolean;

  @IsOptional()
  @IsISO8601()
  mutedUntil?: string | null;
}
