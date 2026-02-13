import { IsBoolean } from 'class-validator';

export class TogglePasskeyDto {
  @IsBoolean()
  enabled!: boolean;
}
