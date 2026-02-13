import { Injectable } from '@nestjs/common';
import { AccessToken } from 'livekit-server-sdk';
import { ConfigService } from '../config/config.service';

@Injectable()
export class LivekitService {
  private readonly livekitApiKey: string;
  private readonly livekitApiSecret: string;
  private readonly livekitUrl: string;

  constructor(private configService: ConfigService) {
    this.livekitApiKey = this.configService.livekitApiKey;
    this.livekitApiSecret = this.configService.livekitApiSecret;
    this.livekitUrl = this.configService.livekitUrl;
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
}
