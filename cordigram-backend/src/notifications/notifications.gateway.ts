import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import { ConfigService } from '../config/config.service';
import { FcmPushService } from './fcm-push.service';
import type { NotificationRealtimePayload } from './notifications.service';

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
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly connections = new Map<string, Set<string>>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly fcmPushService: FcmPushService,
  ) {}

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
      void this.fcmPushService.pushNotificationToUser(userId, typed.notification);
    }
  }

  emitToAll<T>(event: string, payload: T): void {
    this.server.emit(event, payload);
  }

  getConnectedUserCount(): number {
    return this.connections.size;
  }

  getConnectedUserIds(): string[] {
    return Array.from(this.connections.keys());
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
