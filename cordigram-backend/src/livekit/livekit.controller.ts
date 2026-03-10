import { Controller, Get, Post, Body, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { LivekitService } from './livekit.service';
import { ServersService } from '../servers/servers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('livekit')
@UseGuards(JwtAuthGuard)
export class LivekitController {
  constructor(
    private readonly livekitService: LivekitService,
    private readonly serversService: ServersService,
  ) {}

  @Post('token')
  async getToken(
    @Body() body: { roomName: string; participantName: string },
    @CurrentUser() user: any,
  ) {
    const { roomName, participantName } = body;

    if (!roomName || !participantName) {
      return { error: 'roomName and participantName are required' };
    }

    const token = await this.livekitService.generateToken(
      roomName,
      participantName,
      user.userId,
    );

    return {
      token,
      url: process.env.NEXT_PUBLIC_LIVEKIT_URL,
    };
  }

  @Post('room-name')
  async getRoomName(
    @Body() body: { friendId: string },
    @CurrentUser() user: any,
  ) {
    const { friendId } = body;

    if (!friendId) {
      return { error: 'friendId is required' };
    }

    const roomName = this.livekitService.generateRoomName(
      user.userId,
      friendId,
    );

    return { roomName };
  }

  @Get('voice-channel-participants')
  async getVoiceChannelParticipants(
    @Query('serverId') serverId: string,
    @Query('channelId') channelId: string,
    @CurrentUser() user: any,
  ) {
    if (!serverId || !channelId) {
      return { participants: [] };
    }
    const server = await this.serversService.getServerById(serverId);
    if (!this.serversService.isMember(server, user.userId)) {
      throw new ForbiddenException('Bạn không thuộc máy chủ này');
    }
    const participants = await this.livekitService.listVoiceChannelParticipants(
      serverId,
      channelId,
    );
    return { participants };
  }
}
