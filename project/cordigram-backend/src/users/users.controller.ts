import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import type { Request } from 'express';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('settings')
  async getSettings(
    @Req() req: Request & { user?: AuthenticatedUser },
  ): Promise<{ theme: 'light' | 'dark' }> {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    const result = await this.usersService.getSettings(userId);
    return result;
  }

  @Patch('settings')
  async updateSettings(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Body() dto: UpdateSettingsDto,
  ): Promise<{ theme: 'light' | 'dark' }> {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    const result = await this.usersService.updateSettings({
      userId,
      theme: dto.theme,
    });
    return result;
  }
}
