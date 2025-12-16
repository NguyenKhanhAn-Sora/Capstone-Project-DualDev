import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ProfilesService } from './profiles.service';

const USERNAME_REGEX = /^[a-z0-9_]{3,30}$/;

@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get('check-username')
  async checkUsername(
    @Query('username') username?: string,
    @Query('excludeUserId') excludeUserId?: string,
  ): Promise<{ available: boolean }> {
    if (!username) {
      throw new BadRequestException('username is required');
    }
    const normalized = username.toLowerCase();
    if (!USERNAME_REGEX.test(normalized)) {
      throw new BadRequestException('username is invalid');
    }

    const available = await this.profilesService.isUsernameAvailable(
      normalized,
      excludeUserId,
    );
    return { available };
  }
}
