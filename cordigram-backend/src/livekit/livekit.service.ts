import { Injectable, BadRequestException } from '@nestjs/common';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { ConfigService } from '../config/config.service';

const VOICE_CHANNEL_MAX_PARTICIPANTS = 15;

@Injectable()
export class LivekitService {
  private readonly livekitApiKey: string;
  private readonly livekitApiSecret: string;
  private readonly livekitUrl: string;
  private roomService: RoomServiceClient | null = null;

  constructor(private configService: ConfigService) {
    this.livekitApiKey = this.configService.livekitApiKey;
    this.livekitApiSecret = this.configService.livekitApiSecret;
    this.livekitUrl = this.configService.livekitUrl;
  }

  getPublicUrl(): string {
    return this.livekitUrl;
  }

  private getRoomService(): RoomServiceClient {
    if (!this.roomService) {
      const url = this.livekitUrl
        .replace(/^wss:/i, 'https:')
        .replace(/^ws:/i, 'http:');
      this.roomService = new RoomServiceClient(
        url,
        this.livekitApiKey,
        this.livekitApiSecret,
      );
    }
    return this.roomService;
  }

  /**
   * For voice channel rooms (roomName starts with 'voice-'), ensure room has at most 15 participants
   */
  private async ensureVoiceChannelCapacity(roomName: string): Promise<void> {
    if (!roomName.startsWith('voice-')) return;
    try {
      const participants =
        await this.getRoomService().listParticipants(roomName);
      if (participants.length >= VOICE_CHANNEL_MAX_PARTICIPANTS) {
        throw new BadRequestException(
          'Kênh thoại đã đủ 15 người. Vui lòng thử lại sau.',
        );
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      // Room may not exist yet (0 participants) - allow join
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
    await this.ensureVoiceChannelCapacity(roomName);

    return this.generateTokenWithPermissions({
      roomName,
      participantName,
      participantId,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
  }

  async generateTokenWithPermissions(params: {
    roomName: string;
    participantName: string;
    participantId: string;
    canPublish: boolean;
    canSubscribe: boolean;
    canPublishData: boolean;
  }): Promise<string> {
    if (params.roomName.startsWith('voice-')) {
      await this.ensureVoiceChannelCapacity(params.roomName);
    }

    const at = new AccessToken(this.livekitApiKey, this.livekitApiSecret, {
      identity: params.participantId,
      name: params.participantName,
    });

    at.addGrant({
      roomJoin: true,
      room: params.roomName,
      canPublish: params.canPublish,
      canSubscribe: params.canSubscribe,
      canPublishData: params.canPublishData,
    });

    return await at.toJwt();
  }

  async getParticipantCount(roomName: string): Promise<number> {
    try {
      const participants =
        await this.getRoomService().listParticipants(roomName);
      return participants.filter(
        (p) =>
          !p.identity?.startsWith('preview-') &&
          !p.name?.startsWith('preview-'),
      ).length;
    } catch {
      return 0;
    }
  }

  async listRoomsByPrefix(
    prefix: string,
  ): Promise<Array<{ name: string; numParticipants: number }>> {
    const rooms = await this.getRoomService().listRooms();
    return rooms
      .filter((room) => (room.name ?? '').startsWith(prefix))
      .map((room) => ({
        name: room.name ?? '',
        numParticipants: room.numParticipants ?? 0,
      }));
  }

  async deleteRoomSafe(roomName: string): Promise<void> {
    try {
      await this.getRoomService().deleteRoom(roomName);
    } catch {
      // Ignore not-found and transient errors during room cleanup.
    }
  }

  /**
   * Generate room name for a DM call between two users
   * Uses sorted user IDs to ensure consistent room name regardless of who initiates
   */
  generateRoomName(userId1: string, userId2: string): string {
    const sortedIds = [userId1, userId2].sort();
    return `dm-${sortedIds[0]}-${sortedIds[1]}`;
  }

  /** Room name for a server voice channel */
  voiceChannelRoomName(serverId: string, channelId: string): string {
    return `voice-${serverId}-${channelId}`;
  }

  /**
   * List participants in a voice channel room (for sidebar display).
   * Returns [] if room does not exist or on error.
   */
  async listVoiceChannelParticipants(
    serverId: string,
    channelId: string,
  ): Promise<{ identity: string; name: string }[]> {
    const roomName = this.voiceChannelRoomName(serverId, channelId);
    try {
      const participants =
        await this.getRoomService().listParticipants(roomName);
      return participants.map((p) => ({
        identity: p.identity ?? '',
        name: p.name ?? p.identity ?? 'Người dùng',
      }));
    } catch {
      return [];
    }
  }

  /**
   * Return a lightweight snapshot of current LiveKit usage for admin dashboard.
   */
  async getRealtimeStats(): Promise<{
    rooms: number;
    participants: number;
  }> {
    const rooms = await this.getRoomService().listRooms();

    const participants = rooms.reduce((sum, room) => {
      const roomParticipants =
        typeof room.numParticipants === 'number' ? room.numParticipants : 0;
      return sum + roomParticipants;
    }, 0);

    return {
      rooms: rooms.length,
      participants,
    };
  }
}
