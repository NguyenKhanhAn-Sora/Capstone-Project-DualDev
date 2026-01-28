import {
  IsDateString,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const USERNAME_REGEX = /^[a-z0-9_.]{3,30}$/;

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  @Matches(USERNAME_REGEX)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  bio?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(male|female|other|prefer_not_to_say)$/)
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';

  @IsOptional()
  @IsDateString()
  birthdate?: string;

  // LinkedIn-style workplace
  @IsOptional()
  @IsString()
  @MaxLength(120)
  workplaceName?: string;

  @IsOptional()
  @IsMongoId()
  workplaceCompanyId?: string;
}
