import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Injectable } from '@nestjs/common';

@WebSocketGateway({
  namespace: '/channel-messages',
  cors: { origin: '*' },
})
@Injectable()
export class ChannelMessagesGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;

  private readonly userSockets = new Map<string, Set<string>>();

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(socket: Socket) {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        socket.disconnect();
        return;
      }
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'your_secret_key',
      });
      const userId = payload.userId || payload.sub;
      socket.data.userId = userId;

      const sockets = this.userSockets.get(userId) ?? new Set<string>();
      sockets.add(socket.id);
      this.userSockets.set(userId, sockets);
    } catch (err) {
      socket.disconnect();
    }
  }

  handleDisconnect(socket: Socket) {
    const userId = socket.data?.userId as string | undefined;
    if (!userId) return;
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.delete(socket.id);
      if (!sockets.size) this.userSockets.delete(userId);
    }
  }

  @SubscribeMessage('join-channel')
  handleJoinChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId: string },
  ) {
    if (!client?.join) return;
    const channelId = body?.channelId;
    if (channelId && typeof channelId === 'string') {
      client.join(`channel:${channelId}`);
    }
  }

  @SubscribeMessage('leave-channel')
  handleLeaveChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId: string },
  ) {
    if (!client?.leave) return;
    const channelId = body?.channelId;
    if (channelId && typeof channelId === 'string') {
      client.leave(`channel:${channelId}`);
    }
  }

  emitNewMessage(channelId: string, message: any) {
    this.server.to(`channel:${channelId}`).emit('new-message', { message });
  }

  emitReactionUpdate(
    channelId: string,
    messageId: string,
    reactions: any[],
  ) {
    this.server
      .to(`channel:${channelId}`)
      .emit('reaction-updated', { messageId, reactions });
  }

  /**
   * Push a notification event directly to a specific user (by userId),
   * regardless of which channel rooms they have joined.
   */
  emitToUser(userId: string, event: string, payload: any): void {
    const socketIds = this.userSockets.get(userId);
    if (!socketIds?.size) return;
    socketIds.forEach((socketId) => {
      this.server.to(socketId).emit(event, payload);
    });
  }
}
