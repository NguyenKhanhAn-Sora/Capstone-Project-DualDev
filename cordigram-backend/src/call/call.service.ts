import { Injectable, BadRequestException } from '@nestjs/common';
import { LivekitService } from '../livekit/livekit.service';

/**
 * Unified Call service that exposes a clean {roomId, callToken, serverUrl}
 * contract for both web and mobile clients.
 *
 * Internally delegates to LiveKit (already integrated for the web app).
 * This lets us call between web ↔ mobile ↔ mobile without platform-specific
 * signaling: LiveKit handles media, and our Socket.IO gateway
 * (`direct-messages` namespace) keeps handling ring / answer / reject events.
 */
@Injectable()
export class CallService {
  // LiveKit access tokens in this app are issued with the default TTL
  // (6 hours). We surface an explicit `expiresAt` so clients can refresh
  // before it runs out.
  private static readonly TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

  constructor(private readonly livekitService: LivekitService) {}

  /**
   * Create a new 1:1 DM call between the authenticated user and `peerUserId`.
   * Returns both the stable `roomId` and a fresh `callToken`.
   */
  async createDmCall(params: {
    callerUserId: string;
    callerName: string;
    peerUserId: string;
    video: boolean;
  }) {
    const callerUserId = params.callerUserId?.trim();
    const peerUserId = params.peerUserId?.trim();

    if (!callerUserId || !peerUserId) {
      throw new BadRequestException('callerUserId và peerUserId là bắt buộc');
    }
    if (callerUserId === peerUserId) {
      throw new BadRequestException('Không thể gọi cho chính mình');
    }

    const roomId = this.livekitService.generateRoomName(
      callerUserId,
      peerUserId,
    );

    return this.issueToken({
      roomId,
      userId: callerUserId,
      participantName: params.callerName,
      video: params.video,
    });
  }

  /**
   * Join an existing call room. The caller must supply the `roomId`
   * returned by a prior `createDmCall` (or relayed via signaling).
   */
  async joinCall(params: {
    userId: string;
    participantName: string;
    roomId: string;
    video: boolean;
  }) {
    const roomId = params.roomId?.trim();
    if (!roomId) {
      throw new BadRequestException('roomId là bắt buộc');
    }

    // For DM rooms we validate the user is one of the two participants
    // encoded in the room name: `dm-<sortedId1>-<sortedId2>`.
    if (roomId.startsWith('dm-')) {
      const parts = roomId.split('-');
      if (parts.length !== 3 || !parts[1] || !parts[2]) {
        throw new BadRequestException('roomId không hợp lệ');
      }
      if (params.userId !== parts[1] && params.userId !== parts[2]) {
        throw new BadRequestException(
          'Bạn không phải là thành viên của cuộc gọi này',
        );
      }
    }

    return this.issueToken({
      roomId,
      userId: params.userId,
      participantName: params.participantName,
      video: params.video,
    });
  }

  private async issueToken(params: {
    roomId: string;
    userId: string;
    participantName: string;
    video: boolean;
  }) {
    const callToken = await this.livekitService.generateToken(
      params.roomId,
      params.participantName || 'Người dùng',
      params.userId,
    );

    return {
      roomId: params.roomId,
      callToken,
      serverUrl: this.livekitService.getPublicUrl(),
      expiresAt: new Date(Date.now() + CallService.TOKEN_TTL_MS).toISOString(),
      isVideo: params.video,
    };
  }
}
