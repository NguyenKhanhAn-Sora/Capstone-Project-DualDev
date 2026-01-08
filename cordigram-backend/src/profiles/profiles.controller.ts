import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import type { Request } from 'express';

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

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(
    @Req()
    req: Request & {
      user?: AuthenticatedUser;
    },
  ) {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    const profile = await this.profilesService.findByUserId(user.userId);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    return {
      id: profile._id?.toString?.() ?? (profile as { id?: string }).id,
      userId: profile.userId?.toString?.() ?? user.userId,
      displayName: profile.displayName,
      username: profile.username,
      avatarUrl: profile.avatarUrl,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('search')
  async searchProfiles(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    if (!q || !q.trim()) {
      throw new BadRequestException('q is required');
    }

    const results = await this.profilesService.searchProfiles({
      query: q,
      limit: limit ? Number(limit) : 8,
      excludeUserId: user.userId,
    });

    return {
      items: results,
      count: results.length,
    };
  }
}
