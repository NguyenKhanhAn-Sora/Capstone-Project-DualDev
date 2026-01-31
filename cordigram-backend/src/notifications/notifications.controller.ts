import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Query('limit') limit?: string,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const parsedLimit = limit ? Math.max(1, Math.min(50, Number(limit))) : 30;
    return this.notificationsService.list(userId, parsedLimit);
  }

  @Get('unread-count')
  async unreadCount(@Req() req: Request & { user?: AuthenticatedUser }) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.notificationsService.getUnreadCount(userId);
  }

  @Post('read-all')
  async markAllRead(@Req() req: Request & { user?: AuthenticatedUser }) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.notificationsService.markAllRead(userId);
  }

  @Patch(':id/read')
  async markRead(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Param('id') id: string,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.notificationsService.markRead(userId, id);
  }
}
