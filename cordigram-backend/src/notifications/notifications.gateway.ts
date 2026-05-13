import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { OnModuleInit } from '@nestjs/common';
import type { Model } from 'mongoose';
import type { Server, Socket } from 'socket.io';
import { createHmac } from 'crypto';
import { ConfigService } from '../config/config.service';
import { FcmPushService } from './fcm-push.service';
import type { NotificationRealtimePayload } from './notifications.service';
import { OnlineStats } from './online-stats.schema';

interface AccessTokenPayload {
  sub: string;
  email: string;
  type: 'access' | 'signup';
}

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: (origin, callback) => callback(null, true),
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  server: Server;

  private readonly connections = new Map<string, Set<string>>();
  /** Maps deviceIdHash → Set<socketId> for targeted per-device emits */
  private readonly deviceConnections = new Map<string, Set<string>>();
  private readonly onlineStatsKey = 'global';
  private peakOnlineUsers = 0;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly fcmPushService: FcmPushService,
    @InjectModel(OnlineStats.name)
    private readonly onlineStatsModel: Model<OnlineStats>,
  ) {}

  async onModuleInit() {
    const existing = await this.onlineStatsModel
      .findOne({ key: this.onlineStatsKey })
      .select('peakOnlineUsers')
      .lean()
      .exec();

    this.peakOnlineUsers = Number(existing?.peakOnlineUsers ?? 0);

    if (!existing) {
      await this.onlineStatsModel
        .updateOne(
          { key: this.onlineStatsKey },
          {
            $setOnInsert: {
              key: this.onlineStatsKey,
              peakOnlineUsers: 0,
              lastOnlineUsers: 0,
            },
          },
          { upsert: true },
        )
        .exec();
    }
  }

  handleConnection(client: Socket) {
    const token = this.extractToken(client);
    if (!token) {
      client.disconnect();
      return;
    }

    const payload = this.verifyAccessToken(token);
    if (!payload) {
      client.disconnect();
      return;
    }

    const userId = payload.sub;
    client.data.userId = userId;

    const current = this.connections.get(userId) ?? new Set<string>();
    current.add(client.id);
    this.connections.set(userId, current);

    const rawDeviceId = client.handshake.query?.deviceId as string | undefined;
    if (rawDeviceId?.trim()) {
      const deviceIdHash = this.hashDeviceId(rawDeviceId.trim());
      client.data.deviceIdHash = deviceIdHash;
      const devSockets = this.deviceConnections.get(deviceIdHash) ?? new Set<string>();
      devSockets.add(client.id);
      this.deviceConnections.set(deviceIdHash, devSockets);
    }

    client.emit('system:online-stats', this.getOnlineStatsSnapshot());
    void this.publishOnlineStats();
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.userId as string | undefined;
    if (!userId) return;
    const current = this.connections.get(userId);
    if (!current) return;
    current.delete(client.id);
    if (!current.size) {
      this.connections.delete(userId);
    }

    const deviceIdHash = client.data?.deviceIdHash as string | undefined;
    if (deviceIdHash) {
      const devSockets = this.deviceConnections.get(deviceIdHash);
      if (devSockets) {
        devSockets.delete(client.id);
        if (!devSockets.size) this.deviceConnections.delete(deviceIdHash);
      }
    }

    void this.publishOnlineStats();
  }

  emitToUser<T>(userId: string, event: string, payload: T): void {
    const sockets = this.connections.get(userId);
    if (sockets?.size) {
      sockets.forEach((socketId) => {
        this.server.to(socketId).emit(event, payload);
      });
    }

    if (event === 'notification:new') {
      const typed = payload as unknown as NotificationRealtimePayload;
      void this.fcmPushService.pushNotificationToUser(
        userId,
        typed.notification,
      );
    }
  }

  emitToDevice<T>(deviceIdHash: string, event: string, payload: T): void {
    const sockets = this.deviceConnections.get(deviceIdHash);
    if (sockets?.size) {
      sockets.forEach((socketId) => {
        this.server.to(socketId).emit(event, payload);
      });
    }
  }

  emitToAll<T>(event: string, payload: T): void {
    this.server.emit(event, payload);
  }

  private hashDeviceId(deviceId: string): string {
    return createHmac('sha256', this.config.jwtSecret)
      .update(deviceId)
      .digest('hex');
  }

  getConnectedUserCount(): number {
    return this.connections.size;
  }

  getConnectedUserIds(): string[] {
    return Array.from(this.connections.keys());
  }

  getOnlineStatsSnapshot(): {
    onlineUsersRealtime: number;
    onlineUsersPeakAllTime: number;
  } {
    return {
      onlineUsersRealtime: this.getConnectedUserCount(),
      onlineUsersPeakAllTime: this.peakOnlineUsers,
    };
  }

  private async publishOnlineStats() {
    const currentOnlineUsers = this.getConnectedUserCount();

    if (currentOnlineUsers > this.peakOnlineUsers) {
      this.peakOnlineUsers = currentOnlineUsers;

      await this.onlineStatsModel
        .updateOne(
          { key: this.onlineStatsKey },
          {
            $set: {
              peakOnlineUsers: this.peakOnlineUsers,
              lastOnlineUsers: currentOnlineUsers,
            },
          },
          { upsert: true },
        )
        .exec();
    }

    this.emitToAll('system:online-stats', this.getOnlineStatsSnapshot());
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.trim();
    }

    const header = client.handshake.headers?.authorization;
    if (typeof header === 'string') {
      const match = header.match(/^Bearer\s+(.+)$/i);
      if (match?.[1]) return match[1];
    }

    return null;
  }

  private verifyAccessToken(token: string): AccessTokenPayload | null {
    try {
      const payload = this.jwt.verify<AccessTokenPayload>(token, {
        secret: this.config.jwtSecret,
      });
      if (payload.type !== 'access') return null;
      return payload;
    } catch (_err) {
      return null;
    }
  }
}
