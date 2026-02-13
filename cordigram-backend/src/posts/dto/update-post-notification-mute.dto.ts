import { IsBoolean, IsISO8601, IsOptional } from 'class-validator';

export class UpdatePostNotificationMuteDto {
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
