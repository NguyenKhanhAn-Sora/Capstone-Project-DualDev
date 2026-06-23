import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { LivekitService } from './livekit.service';
import { ServersService } from '../servers/servers.service';
import { ChannelsService } from '../channels/channels.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('livekit')
@UseGuards(JwtAuthGuard)
export class LivekitController {
  constructor(
    private readonly livekitService: LivekitService,
    private readonly serversService: ServersService,
    private readonly channelsService: ChannelsService,
  ) {}

  private async assertCanJoinRoom(userId: string, roomName: string): Promise<void> {
    if (roomName.startsWith('dm-')) {
      const parts = roomName.split('-');
      if (parts.length !== 3 || !parts[1] || !parts[2]) {
        throw new ForbiddenException('Phòng gọi không hợp lệ');
      }
      if (userId !== parts[1] && userId !== parts[2]) {
        throw new ForbiddenException('Bạn không phải là thành viên của cuộc gọi này');
      }
      return;
    }

    if (roomName.startsWith('voice-')) {
      const rest = roomName.slice('voice-'.length);
      const dash = rest.indexOf('-');
      if (dash <= 0) {
        throw new ForbiddenException('Phòng voice không hợp lệ');
      }
      const serverId = rest.slice(0, dash);
      const channelId = rest.slice(dash + 1);
      if (!serverId || !channelId) {
        throw new ForbiddenException('Phòng voice không hợp lệ');
      }
      const server = await this.serversService.getServerById(serverId);
      if (!this.serversService.isMember(server, userId)) {
        throw new ForbiddenException('Bạn không thuộc máy chủ này');
      }
      const ownerId = (server as any).ownerId?.toString?.() ?? '';
      if (ownerId !== userId) {
        const member = ((server as any).members || []).find(
          (m: any) => m?.userId?.toString?.() === userId,
        );
        if (member?.timeoutUntil) {
          const until = new Date(member.timeoutUntil);
          if (!Number.isNaN(until.getTime()) && until.getTime() > Date.now()) {
            throw new ForbiddenException(
              'Bạn đang bị hạn chế và không thể tham gia kênh thoại.',
            );
          }
        }
      }
      await this.channelsService.assertCanAccessChannel(channelId, userId);
      return;
    }

    throw new ForbiddenException('Loại phòng không được hỗ trợ');
  }

  @Post('token')
  async getToken(
    @Body() body: { roomName: string; participantName: string },
    @CurrentUser() user: any,
  ) {
    const { roomName, participantName } = body;

    if (!roomName || !participantName) {
      return { error: 'roomName and participantName are required' };
    }

    await this.assertCanJoinRoom(user.userId, roomName);

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
