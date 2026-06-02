import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/;

export class ConfirmChangePasswordDto {
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(PASSWORD_REGEX, {
    message: 'Password must be 8–72 characters and include uppercase, lowercase, and a number.',
  })
  newPassword!: string;
}
