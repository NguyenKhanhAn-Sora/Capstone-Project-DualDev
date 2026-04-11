import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class JoinLivestreamDto {
  @IsOptional()
  @IsBoolean()
  asHost?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  participantName?: string;
}
