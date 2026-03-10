import { Body, Controller, Get, Post, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InboxService } from './inbox.service';
import { MarkSeenDto } from './dto/mark-seen.dto';

@Controller('inbox')
@UseGuards(JwtAuthGuard)
export class InboxController {
  constructor(private readonly inboxService: InboxService) {}

  @Get('for-you')
  async getForYou(@Request() req: any) {
    const items = await this.inboxService.getForYou(req.user.userId);
    return { items };
  }

  @Post('seen')
  async markSeen(@Body() dto: MarkSeenDto, @Request() req: any) {
    await this.inboxService.markSeen(req.user.userId, dto.sourceType, dto.sourceId);
    return { ok: true };
  }

  @Get('unread')
  async getUnread(@Request() req: any) {
    const items = await this.inboxService.getUnread(req.user.userId);
    return { items };
  }

  @Get('mentions')
  async getMentions(@Request() req: any) {
    const items = await this.inboxService.getMentions(req.user.userId);
    return { items };
  }
}
