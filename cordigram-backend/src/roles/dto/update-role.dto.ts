import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsObject,
  MaxLength,
  MinLength,
  Matches,
  IsArray,
} from 'class-validator';
import { RolePermissions } from '../role.schema';

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

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

export class ReorderRolesDto {
  @IsArray()
  @IsString({ each: true })
  roleIds: string[]; // Array of role IDs in new order (highest position first)
}
