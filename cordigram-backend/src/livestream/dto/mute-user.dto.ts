import { IsIn, IsString } from 'class-validator';

const ALLOWED_DURATIONS = [5, 10, 15, 30, 60, 1440] as const;
type AllowedDuration = (typeof ALLOWED_DURATIONS)[number];

export class MuteUserDto {
  @IsString()
  userId: string;

  @IsIn(ALLOWED_DURATIONS)
  durationMinutes: AllowedDuration;
}
