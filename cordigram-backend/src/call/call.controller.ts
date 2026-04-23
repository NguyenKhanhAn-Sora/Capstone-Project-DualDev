import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CallService } from './call.service';

/**
 * Clean cross-platform call API.
 *
 * Auth: Bearer JWT only (no cookies / no sessions).
 * Used by both the web app and the Flutter mobile app.
 *
 *   POST /calls/create  → { roomId, callToken, serverUrl, expiresAt }
 *   POST /calls/join    → { roomId, callToken, serverUrl, expiresAt }
 */
@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallController {
  constructor(private readonly callService: CallService) {}

  @Post('create')
  async createCall(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      peerUserId?: string;
      video?: boolean;
      participantName?: string;
    },
  ) {
    if (!user?.userId) {
      throw new BadRequestException('Không xác thực được người dùng');
    }
    if (!body?.peerUserId) {
      throw new BadRequestException('peerUserId là bắt buộc');
    }

    return this.callService.createDmCall({
      callerUserId: user.userId,
      callerName: (body.participantName ?? '').trim() || 'Người dùng',
      peerUserId: body.peerUserId,
      video: Boolean(body.video),
    });
  }

  @Post('join')
  async joinCall(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      roomId?: string;
      video?: boolean;
      participantName?: string;
    },
  ) {
    if (!user?.userId) {
      throw new BadRequestException('Không xác thực được người dùng');
    }
    if (!body?.roomId) {
      throw new BadRequestException('roomId là bắt buộc');
    }

    return this.callService.joinCall({
      userId: user.userId,
      participantName: (body.participantName ?? '').trim() || 'Người dùng',
      roomId: body.roomId,
      video: Boolean(body.video),
    });
  }
}
