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
    } catch (err) {
      socket.disconnect();
    }
  }

  handleDisconnect(_socket: Socket) {}

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
}
