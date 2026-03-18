import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DirectMessagesService } from './direct-messages.service';
import { JwtService } from '@nestjs/jwt';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Profile } from '../profiles/profile.schema';

@WebSocketGateway({
  namespace: '/direct-messages',
  cors: {
    origin: '*',
  },
})
@Injectable()
export class DirectMessagesGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;

  private connectedUsers = new Map<string, string>(); // userId -> socketId

  private async emitDmUnreadCount(toUserId: string, fromUserId?: string) {
    const socketId = this.connectedUsers.get(toUserId);
    if (!socketId) return;
    try {
      const [totalUnread, conversationUnread] = await Promise.all([
        this.directMessagesService.getUnreadCount(toUserId),
        fromUserId
          ? this.directMessagesService.getUnreadCountByUser(toUserId, fromUserId)
          : Promise.resolve(undefined),
      ]);
      this.server.to(socketId).emit('dm-unread-count', {
        totalUnread,
        fromUserId: fromUserId ?? null,
        conversationUnread:
          typeof conversationUnread === 'number' ? conversationUnread : null,
      });
    } catch (_err) {
      // ignore
    }
  }

  emitReactionUpdate(payload: {
    messageId: string;
    senderId: string;
    receiverId: string;
    reactions: any[];
  }) {
    // Fallback broadcast (client will ignore if messageId not present in view)
    this.server.emit('reaction-added', {
      messageId: payload.messageId,
      reactions: payload.reactions,
    });
    this.server.emit('reaction-updated', {
      messageId: payload.messageId,
      reactions: payload.reactions,
    });

    const receiverSocket = this.connectedUsers.get(payload.receiverId);
    if (receiverSocket) {
      this.server.to(receiverSocket).emit('reaction-added', {
        messageId: payload.messageId,
        reactions: payload.reactions,
      });
    }

    const senderSocket = this.connectedUsers.get(payload.senderId);
    if (senderSocket) {
      this.server.to(senderSocket).emit('reaction-updated', {
        messageId: payload.messageId,
        reactions: payload.reactions,
      });
    }
  }

  emitNewDirectMessageFromRest(payload: {
    senderId: string;
    receiverId: string;
    message: any;
  }) {
    const receiverSocket = this.connectedUsers.get(payload.receiverId);
    if (receiverSocket) {
      this.server.to(receiverSocket).emit('new-message', {
        message: payload.message,
        fromUser: {
          userId: payload.senderId,
          username: payload.message?.senderId?.username,
        },
      });
    }
    // Also push unread count update (if receiver is online)
    this.emitDmUnreadCount(payload.receiverId, payload.senderId);
  }

  constructor(
    private readonly directMessagesService: DirectMessagesService,
    private readonly jwtService: JwtService,
    @InjectModel(Profile.name) private profileModel: Model<Profile>,
  ) {}

  async handleConnection(socket: Socket) {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        socket.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'your_secret_key',
      });

      const userId = payload.userId || payload.sub;
      socket.data.userId = userId;
      this.connectedUsers.set(userId, socket.id);

      // Send initial unread count to the user (badge can render immediately)
      await this.emitDmUnreadCount(userId);

      // Notify others that user is online
      this.server.emit('user-online', {
        userId,
        status: 'online',
      });

      console.log(`User ${userId} connected with socket ${socket.id}`);
    } catch (error) {
      console.error('Connection error:', error);
      socket.disconnect();
    }
  }

  async handleDisconnect(socket: Socket) {
    const userId = socket.data.userId;
    if (userId) {
      this.connectedUsers.delete(userId);

      // Notify others that user is offline
      this.server.emit('user-offline', {
        userId,
        status: 'offline',
      });

      console.log(`User ${userId} disconnected`);
    }
  }

  @SubscribeMessage('send-message')
  async handleSendMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    data: { receiverId: string; content: string; attachments?: string[] },
  ) {
    try {
      const senderId = socket.data.userId;
      console.log(`Sending message from ${senderId} to ${data.receiverId}`);

      const message = await this.directMessagesService.createDirectMessage(
        senderId,
        data.receiverId,
        {
          content: data.content,
          attachments: data.attachments || [],
        },
      );

      const populatedMessage =
        await this.directMessagesService.getDirectMessageById(
          message._id.toString(),
        );

      console.log('Message saved:', populatedMessage);
      console.log('Receiver ID:', data.receiverId);
      console.log(
        'All connected users:',
        Array.from(this.connectedUsers.keys()),
      );

      // Send to receiver
      const receiverSocket = this.connectedUsers.get(data.receiverId);
      if (receiverSocket) {
        console.log('Sending message to receiver socket:', receiverSocket);
        this.server.to(receiverSocket).emit('new-message', {
          message: populatedMessage,
          fromUser: {
            userId: senderId,
            username: populatedMessage.senderId['username'],
          },
        });
        // Push unread count update to receiver (badge)
        await this.emitDmUnreadCount(data.receiverId, senderId);
      } else {
        console.log('Receiver not online, message saved to database');
      }

      // Confirm to sender
      socket.emit('message-sent', {
        message: populatedMessage,
      });
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', {
        message: 'Failed to send message',
      });
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { receiverId: string; isTyping: boolean },
  ) {
    try {
      const userId = socket.data.userId;
      const receiverSocket = this.connectedUsers.get(data.receiverId);

      if (receiverSocket) {
        // ✅ Debug: Log userId
        console.log('🔍 Typing - userId:', userId);

        // ✅ Import Types from mongoose and convert userId to ObjectId
        const { Types } = require('mongoose');
        const userObjectId = new Types.ObjectId(userId);

        // Get sender's profile to send username
        const senderProfile = await this.profileModel
          .findOne({ userId: userObjectId })
          .select('username displayName avatarUrl')
          .lean()
          .exec();

        console.log('🔍 Typing - senderProfile:', senderProfile);

        const username =
          senderProfile?.username || senderProfile?.displayName || 'Unknown';

        console.log('🔍 Typing - username to send:', username);

        this.server.to(receiverSocket).emit('user-typing', {
          fromUserId: userId,
          username,
          isTyping: data.isTyping,
        });
      }
    } catch (error) {
      console.error('❌ Error handling typing:', error);
    }
  }

  @SubscribeMessage('mark-as-read')
  async handleMarkAsRead(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { messageIds: string[]; senderId: string },
  ) {
    try {
      const userId = socket.data.userId;
      await this.directMessagesService.markAsRead(data.messageIds, userId);

      // Update receiver badge counts after marking read
      await this.emitDmUnreadCount(userId, data.senderId);

      // Notify sender that messages are read
      const senderSocket = this.connectedUsers.get(data.senderId);
      if (senderSocket) {
        this.server.to(senderSocket).emit('messages-read', {
          byUserId: userId,
          messageIds: data.messageIds,
        });
      }
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  }

  @SubscribeMessage('mark-all-as-read')
  async handleMarkAllAsRead(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { senderId: string },
  ) {
    try {
      const userId = socket.data.userId;
      if (!data?.senderId) return;
      await this.directMessagesService.markConversationAsRead(
        userId,
        data.senderId,
      );

      // Update receiver badge counts after marking read
      await this.emitDmUnreadCount(userId, data.senderId);

      // Notify sender UI (optional)
      const senderSocket = this.connectedUsers.get(data.senderId);
      if (senderSocket) {
        this.server.to(senderSocket).emit('messages-read', {
          byUserId: userId,
          messageIds: [],
          all: true,
        });
      }
    } catch (error) {
      console.error('Error marking conversation as read:', error);
    }
  }

  @SubscribeMessage('add-reaction')
  async handleAddReaction(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    data: { messageId: string; emoji: string; receiverId: string },
  ) {
    try {
      const userId = socket.data.userId;
      const message = await this.directMessagesService.addReaction(
        data.messageId,
        data.emoji,
        userId,
      );

      // Notify receiver
      const receiverSocket = this.connectedUsers.get(data.receiverId);
      if (receiverSocket) {
        this.server.to(receiverSocket).emit('reaction-added', {
          messageId: data.messageId,
          emoji: data.emoji,
          userId,
          reactions: message.reactions,
        });
      }
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  }

  // Call-related events
  @SubscribeMessage('call-initiate')
  async handleCallInitiate(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { receiverId: string; type: 'audio' | 'video' },
  ) {
    try {
      const senderId = socket.data.userId;
      const receiverSocket = this.connectedUsers.get(data.receiverId);

      // Get sender's profile for username and avatar
      const { Types } = require('mongoose');
      const senderObjectId = new Types.ObjectId(senderId);

      console.log(
        '📞 [CALL] User',
        senderId,
        'initiating',
        data.type,
        'call to',
        data.receiverId,
      );
      console.log('📞 [CALL-DEBUG] Looking up profile for userId:', senderId);
      console.log(
        '📞 [CALL-DEBUG] ObjectId created:',
        senderObjectId.toString(),
      );

      const senderProfile = await this.profileModel.findOne({
        userId: senderObjectId,
      });

      console.log('📞 [CALL-DEBUG] Profile query completed');
      console.log('📞 [CALL-DEBUG] Sender profile found:', {
        _id: senderProfile?._id?.toString(),
        userId: senderProfile?.userId?.toString(),
        username: senderProfile?.username,
        displayName: senderProfile?.displayName,
        avatarUrl: senderProfile?.avatarUrl,
        hasProfile: !!senderProfile,
        rawProfile: senderProfile ? JSON.stringify(senderProfile) : 'null',
      });

      const callerInfo = {
        userId: senderId,
        username:
          senderProfile?.username || senderProfile?.displayName || 'User',
        displayName:
          senderProfile?.displayName || senderProfile?.username || 'User',
        avatar: senderProfile?.avatarUrl || null,
      };

      console.log(
        '📞 [CALL-DEBUG] CallerInfo constructed:',
        JSON.stringify(callerInfo, null, 2),
      );

      if (receiverSocket) {
        const payload = {
          from: senderId,
          type: data.type,
          callerInfo,
        };

        console.log(
          '📞 [CALL-DEBUG] Emitting call-incoming event with payload:',
          JSON.stringify(payload, null, 2),
        );

        this.server.to(receiverSocket).emit('call-incoming', payload);

        console.log(
          '✅ [CALL] Call notification sent to receiver socket:',
          receiverSocket,
        );
        console.log(
          '✅ [CALL] CallerInfo.displayName sent:',
          callerInfo.displayName,
        );
      } else {
        console.log(
          '⚠️ [CALL] Receiver not online - receiverId:',
          data.receiverId,
        );
        console.log(
          '⚠️ [CALL] Connected users:',
          Array.from(this.connectedUsers.keys()),
        );
      }
    } catch (error) {
      console.error('❌ [CALL] Error initiating call:', error);
    }
  }

  @SubscribeMessage('call-answer')
  handleCallAnswer(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { callerId: string; sdpOffer: any },
  ) {
    const userId = socket.data.userId;
    const callerSocket = this.connectedUsers.get(data.callerId);

    if (callerSocket) {
      this.server.to(callerSocket).emit('call-answer', {
        from: userId,
        sdpOffer: data.sdpOffer,
      });
    }
  }

  @SubscribeMessage('call-reject')
  handleCallReject(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { callerId: string },
  ) {
    const userId = socket.data.userId;
    const callerSocket = this.connectedUsers.get(data.callerId);

    if (callerSocket) {
      this.server.to(callerSocket).emit('call-rejected', {
        from: userId,
      });
    }
  }

  @SubscribeMessage('ice-candidate')
  handleIceCandidate(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { peerId: string; candidate: any },
  ) {
    const userId = socket.data.userId;
    const peerSocket = this.connectedUsers.get(data.peerId);

    if (peerSocket) {
      this.server.to(peerSocket).emit('ice-candidate', {
        from: userId,
        candidate: data.candidate,
      });
    }
  }

  @SubscribeMessage('call-end')
  handleCallEnd(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { peerId: string },
  ) {
    const userId = socket.data.userId;
    const peerSocket = this.connectedUsers.get(data.peerId);

    console.log(
      '📞 [CALL-END] User',
      userId,
      'ending/canceling call with',
      data.peerId,
    );

    if (peerSocket) {
      this.server.to(peerSocket).emit('call-ended', {
        from: userId,
      });
      console.log(
        '✅ [CALL-END] Call cancellation notification sent to',
        data.peerId,
      );
    } else {
      console.log('⚠️ [CALL-END] Peer not online');
    }
  }

  getConnectedUsers() {
    return Array.from(this.connectedUsers.keys());
  }

  getSocketIdByUserId(userId: string) {
    return this.connectedUsers.get(userId);
  }
}
