import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
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
import { BlocksService } from './blocks.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly blocksService: BlocksService,
  ) {}

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

  @Post(':id/follow')
  async follow(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Param('id') targetUserId: string,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.usersService.follow(userId, targetUserId);
  }

  @Delete(':id/follow')
  async unfollow(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Param('id') targetUserId: string,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.usersService.unfollow(userId, targetUserId);
  }

  @Post(':id/block')
  async block(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Param('id') targetUserId: string,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.blocksService.block(userId, targetUserId);
  }

  @Delete(':id/block')
  async unblock(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Param('id') targetUserId: string,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.blocksService.unblock(userId, targetUserId);
  }
}
