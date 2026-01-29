import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { LivekitService } from './livekit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('livekit')
@UseGuards(JwtAuthGuard)
export class LivekitController {
  constructor(private readonly livekitService: LivekitService) {}

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

    const roomName = this.livekitService.generateRoomName(user.userId, friendId);

    return { roomName };
  }
}
