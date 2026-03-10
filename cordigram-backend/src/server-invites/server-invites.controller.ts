import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ServerInvitesService } from './server-invites.service';
import { CreateServerInviteDto } from './dto/create-server-invite.dto';

@Controller('server-invites')
@UseGuards(JwtAuthGuard)
export class ServerInvitesController {
  constructor(private readonly serverInvitesService: ServerInvitesService) {}

  @Post()
  async create(
    @Body() dto: CreateServerInviteDto,
    @Request() req: { user: { userId: string } },
  ) {
    return this.serverInvitesService.create(
      req.user.userId,
      dto.toUserId,
      dto.serverId,
    );
  }

  @Get('me')
  async getMyInvites(@Request() req: { user: { userId: string } }) {
    return this.serverInvitesService.getPendingForUser(req.user.userId);
  }

  @Post('accept-by-server')
  async acceptByServer(
    @Body() body: { serverId: string },
    @Request() req: { user: { userId: string } },
  ) {
    await this.serverInvitesService.acceptByServer(body.serverId, req.user.userId);
    return { message: 'Đã chấp nhận lời mời' };
  }

  @Post(':id/accept')
  async accept(
    @Param('id') inviteId: string,
    @Request() req: { user: { userId: string } },
  ) {
    await this.serverInvitesService.accept(inviteId, req.user.userId);
    return { message: 'Đã chấp nhận lời mời' };
  }

  @Post(':id/decline')
  async decline(
    @Param('id') inviteId: string,
    @Request() req: { user: { userId: string } },
  ) {
    await this.serverInvitesService.decline(inviteId, req.user.userId);
    return { message: 'Đã từ chối lời mời' };
  }
}
