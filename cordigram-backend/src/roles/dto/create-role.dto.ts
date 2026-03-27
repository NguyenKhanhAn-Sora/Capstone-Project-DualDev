import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsObject,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import { RolePermissions } from '../role.schema';

export class CreateRoleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @Matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, {
    message: 'Color must be a valid hex color (e.g., #FF5733)',
  })
  color?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsNumber()
  position?: number;

  @IsOptional()
  @IsBoolean()
  displaySeparately?: boolean;

  @IsOptional()
  @IsBoolean()
  mentionable?: boolean;

  @IsOptional()
  @IsObject()
  permissions?: Partial<RolePermissions>;
}
