import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsEnum,
} from 'class-validator';

export class CreateServerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsEnum([
    'custom',
    'gaming',
    'friends',
    'study-group',
    'school-club',
    'local-community',
    'artists-creators',
  ])
  template?: string;

  @IsOptional()
  @IsEnum(['club-community', 'me-and-friends'])
  purpose?: string;
}