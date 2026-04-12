import { IsIn, IsMongoId, IsNotEmpty } from 'class-validator';

const DURATIONS = ['15m', '1h', '3h', '8h', '24h', 'forever'] as const;

export class UpsertMentionMuteDto {
  @IsMongoId()
  @IsNotEmpty()
  mutedUserId: string;

  @IsIn([...DURATIONS])
  duration: (typeof DURATIONS)[number];
}
