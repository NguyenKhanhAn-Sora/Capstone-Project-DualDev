import { Injectable } from '@nestjs/common';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { ConfigService } from '../config/config.service';

@Injectable()
export class LivekitService {
  private readonly livekitApiKey: string;
  private readonly livekitApiSecret: string;
  private readonly livekitUrl: string;
  private readonly roomService: RoomServiceClient;

  constructor(private configService: ConfigService) {
    this.livekitApiKey = this.configService.livekitApiKey;
    this.livekitApiSecret = this.configService.livekitApiSecret;
    this.livekitUrl = this.configService.livekitUrl;
    this.roomService = new RoomServiceClient(
      this.normalizeLivekitUrl(this.livekitUrl),
      this.livekitApiKey,
      this.livekitApiSecret,
    );
  }

  private normalizeLivekitUrl(url: string): string {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'ws:') {
        parsed.protocol = 'http:';
      } else if (parsed.protocol === 'wss:') {
        parsed.protocol = 'https:';
      }
      return parsed.toString().replace(/\/$/, '');
    } catch {
      return url;
    }
  }

  /**
   * Generate LiveKit access token for a user to join a room
   */
  async generateToken(
    roomName: string,
    participantName: string,
    participantId: string,
  ): Promise<string> {
    const at = new AccessToken(this.livekitApiKey, this.livekitApiSecret, {
      identity: participantId,
      name: participantName,
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return await at.toJwt();
  }

  /**
   * Generate room name for a DM call between two users
   * Uses sorted user IDs to ensure consistent room name regardless of who initiates
   */
  generateRoomName(userId1: string, userId2: string): string {
    const sortedIds = [userId1, userId2].sort();
    return `dm-${sortedIds[0]}-${sortedIds[1]}`;
  }

  async getRealtimeStats(): Promise<{
    rooms: number;
    participants: number;
  }> {
    const rooms = await this.roomService.listRooms();
    const participantCounts = await Promise.all(
      rooms.map(async (room) => {
        const participants = await this.roomService.listParticipants(room.name);
        return participants.length;
      }),
    );
    const participants = participantCounts.reduce(
      (total, count) => total + count,
      0,
    );

    return {
      rooms: rooms.length,
      participants,
    };
  }
}
