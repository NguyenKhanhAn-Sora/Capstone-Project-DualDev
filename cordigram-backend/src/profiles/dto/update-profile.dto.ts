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
  @MaxLength(80)
  pronouns?: string;

  /** URL ảnh biểu ngữ (Cloudinary / CDN). */
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  coverUrl?: string;

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

  @IsOptional()
  @IsString()
  @Matches(/^(public|followers|private)$/)
  genderVisibility?: 'public' | 'followers' | 'private';

  @IsOptional()
  @IsString()
  @Matches(/^(public|followers|private)$/)
  birthdateVisibility?: 'public' | 'followers' | 'private';

  @IsOptional()
  @IsString()
  @Matches(/^(public|followers|private)$/)
  locationVisibility?: 'public' | 'followers' | 'private';

  @IsOptional()
  @IsString()
  @Matches(/^(public|followers|private)$/)
  workplaceVisibility?: 'public' | 'followers' | 'private';

  @IsOptional()
  @IsString()
  @Matches(/^(public|followers|private)$/)
  bioVisibility?: 'public' | 'followers' | 'private';

  @IsOptional()
  @IsString()
  @Matches(/^(public|followers|private)$/)
  followersVisibility?: 'public' | 'followers' | 'private';

  @IsOptional()
  @IsString()
  @Matches(/^(public|followers|private)$/)
  followingVisibility?: 'public' | 'followers' | 'private';

  @IsOptional()
  @IsString()
  @Matches(/^(public|followers|private)$/)
  aboutVisibility?: 'public' | 'followers' | 'private';

  @IsOptional()
  @IsString()
  @Matches(/^(public|followers|private)$/)
  profileVisibility?: 'public' | 'followers' | 'private';
}
