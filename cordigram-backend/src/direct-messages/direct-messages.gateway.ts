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
import { User } from '../users/user.schema';

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
  @WebSocketServer() server!: Server;

  private connectedUsers = new Map<string, Set<string>>(); // userId -> socketIds
  private dmPresenceSubs = new Map<string, Set<string>>(); // watcherUserId -> targetUserIds

  private presence = new Map<
    string,
    {
      status: 'online' | 'idle' | 'offline';
      lastActiveAt: number;
      idleTimer?: NodeJS.Timeout;
      sharePresence: boolean;
    }
  >();

  private readonly IDLE_AFTER_MS = 60_000;

  private async emitDmUnreadCount(toUserId: string, fromUserId?: string) {
    const sockets = this.connectedUsers.get(toUserId);
    if (!sockets || sockets.size === 0) return;
    try {
      const [totalUnread, conversationUnread] = await Promise.all([
        this.directMessagesService.getUnreadCount(toUserId),
        fromUserId
          ? this.directMessagesService.getUnreadCountByUser(
              toUserId,
              fromUserId,
            )
          : Promise.resolve(undefined),
      ]);
      for (const socketId of sockets) {
        this.server.to(socketId).emit('dm-unread-count', {
          totalUnread,
          fromUserId: fromUserId ?? null,
          conversationUnread:
            typeof conversationUnread === 'number' ? conversationUnread : null,
        });
      }
    } catch (_err) {
      // ignore
    }
  }

  private getSocketIdsByUserId(userId: string): string[] {
    const set = this.connectedUsers.get(userId);
    return set ? Array.from(set) : [];
  }

  private async getSharePresence(userId: string): Promise<boolean> {
    try {
      const u = await this.userModel
        .findById(userId)
        .select('settings.sharePresence')
        .lean()
        .exec();
      const v = (u as any)?.settings?.sharePresence;
      return v !== false;
    } catch {
      return true;
    }
  }

  private effectiveStatusForViewer(
    targetUserId: string,
  ): 'online' | 'idle' | 'offline' {
    const rec = this.presence.get(targetUserId);
    if (!rec) return 'offline';
    if (rec.sharePresence === false) return 'offline';
    return rec.status;
  }

  private notifyPresenceToSubscribers(
    targetUserId: string,
    status: 'online' | 'idle' | 'offline',
  ) {
    for (const [watcherId, targets] of this.dmPresenceSubs.entries()) {
      if (!targets?.has(targetUserId)) continue;
      const watcherSockets = this.connectedUsers.get(watcherId);
      if (!watcherSockets || watcherSockets.size === 0) continue;
      for (const sid of watcherSockets) {
        this.server.to(sid).emit('presence-updated', {
          userId: targetUserId,
          status,
        });
      }
    }
  }

  private setPresence(
    userId: string,
    next: 'online' | 'idle' | 'offline',
    opts?: { bumpActivity?: boolean },
  ) {
    const now = Date.now();
    const prev =
      this.presence.get(userId) ?? {
        status: 'offline' as const,
        lastActiveAt: now,
        idleTimer: undefined as NodeJS.Timeout | undefined,
        sharePresence: true,
      };

    const sharePresence = prev.sharePresence;
    const lastActiveAt = opts?.bumpActivity ? now : prev.lastActiveAt;

    if (prev.idleTimer) clearTimeout(prev.idleTimer);
    const nextRec: any = {
      status: next,
      lastActiveAt,
      sharePresence,
      idleTimer: undefined as NodeJS.Timeout | undefined,
    };

    // Schedule idle if user is connected + online
    if (next !== 'offline') {
      nextRec.idleTimer = setTimeout(() => {
        const sockets = this.connectedUsers.get(userId);
        if (!sockets || sockets.size === 0) return;
        // Only idle if no activity within window
        const cur = this.presence.get(userId);
        if (!cur) return;
        const delta = Date.now() - cur.lastActiveAt;
        if (delta >= this.IDLE_AFTER_MS) {
          this.setPresence(userId, 'idle');
        }
      }, this.IDLE_AFTER_MS + 250);
    }

    const changed = prev.status !== next;
    this.presence.set(userId, nextRec);

    if (changed && sharePresence !== false) {
      // Back-compat events
      if (next === 'online') {
        this.server.emit('user-online', { userId, status: 'online' });
      } else if (next === 'offline') {
        this.server.emit('user-offline', { userId, status: 'offline' });
      }
      // New event for online/idle/offline
      this.notifyPresenceToSubscribers(userId, next);
      // Keep legacy behavior (global broadcast) so older UI still works
      this.server.emit('presence-updated', { userId, status: next });
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
    if (receiverSocket && receiverSocket.size) {
      for (const sid of receiverSocket) {
        this.server.to(sid).emit('reaction-added', {
          messageId: payload.messageId,
          reactions: payload.reactions,
        });
      }
    }

    const senderSocket = this.connectedUsers.get(payload.senderId);
    if (senderSocket && senderSocket.size) {
      for (const sid of senderSocket) {
        this.server.to(sid).emit('reaction-updated', {
          messageId: payload.messageId,
          reactions: payload.reactions,
        });
      }
    }
  }

  emitNewDirectMessageFromRest(payload: {
    senderId: string;
    receiverId: string;
    message: any;
  }) {
    const receiverSocket = this.connectedUsers.get(payload.receiverId);
    if (receiverSocket && receiverSocket.size) {
      for (const sid of receiverSocket) {
        this.server.to(sid).emit('new-message', {
          message: payload.message,
          fromUser: {
            userId: payload.senderId,
            username: payload.message?.senderId?.username,
          },
        });
      }
    }
    // Also push unread count update (if receiver is online)
    this.emitDmUnreadCount(payload.receiverId, payload.senderId);
  }

  constructor(
    private readonly directMessagesService: DirectMessagesService,
    private readonly jwtService: JwtService,
    @InjectModel(Profile.name) private profileModel: Model<Profile>,
    @InjectModel(User.name) private userModel: Model<User>,
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
      const set = this.connectedUsers.get(userId) ?? new Set<string>();
      set.add(socket.id);
      this.connectedUsers.set(userId, set);

      // cache sharePresence once per connection (default true)
      const sharePresence = await this.getSharePresence(userId);
      const prev = this.presence.get(userId);
      this.presence.set(userId, {
        status: prev?.status ?? 'offline',
        lastActiveAt: prev?.lastActiveAt ?? Date.now(),
        idleTimer: prev?.idleTimer,
        sharePresence,
      });

      // Send initial unread count to the user (badge can render immediately)
      await this.emitDmUnreadCount(userId);

      // Mark as online (or keep offline for others if sharePresence=false)
      this.setPresence(userId, 'online', { bumpActivity: true });

    } catch (error) {
      console.error('Connection error:', error);
      socket.disconnect();
    }
  }

  async handleDisconnect(socket: Socket) {
    const userId = socket.data.userId;
    if (userId) {
      const set = this.connectedUsers.get(userId);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) this.connectedUsers.delete(userId);
      }
      // If no active sockets remain -> offline
      const stillOnline =
        this.connectedUsers.get(userId) &&
        this.connectedUsers.get(userId)!.size > 0;
      if (!stillOnline) {
        this.setPresence(userId, 'offline');
        this.dmPresenceSubs.delete(userId);
      }

    }
  }

  @SubscribeMessage('presence-subscribe')
  async handlePresenceSubscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { userIds: string[] },
  ) {
    const watcherId = socket.data.userId;
    if (!watcherId) return;
    const ids = Array.isArray(data?.userIds)
      ? data.userIds.map((x) => String(x)).filter(Boolean)
      : [];
    const set = this.dmPresenceSubs.get(watcherId) ?? new Set<string>();
    for (const id of ids) set.add(id);
    this.dmPresenceSubs.set(watcherId, set);

    const snapshot = ids.map((targetId) => ({
      userId: targetId,
      status: this.effectiveStatusForViewer(targetId),
    }));
    socket.emit('presence-snapshot', { items: snapshot });
  }

  @SubscribeMessage('presence-activity')
  handlePresenceActivity(@ConnectedSocket() socket: Socket) {
    const userId = socket.data.userId;
    if (!userId) return;
    const sockets = this.connectedUsers.get(userId);
    if (!sockets || sockets.size === 0) return;
    this.setPresence(userId, 'online', { bumpActivity: true });
  }

  @SubscribeMessage('presence-ping')
  handlePresencePing(@ConnectedSocket() socket: Socket) {
    const userId = socket.data.userId;
    if (!userId) return;
    const sockets = this.connectedUsers.get(userId);
    if (!sockets || sockets.size === 0) return;
    this.setPresence(userId, 'online', { bumpActivity: true });
  }

  @SubscribeMessage('send-message')
  async handleSendMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    data: { receiverId: string; content: string; attachments?: string[] },
  ) {
    try {
      const senderId = socket.data.userId;

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


      // Send to receiver
      const receiverSocket = this.connectedUsers.get(data.receiverId);
      if (receiverSocket && receiverSocket.size) {
        for (const sid of receiverSocket) {
          this.server.to(sid).emit('new-message', {
            message: populatedMessage,
            fromUser: {
              userId: senderId,
              username: populatedMessage.senderId['username'],
            },
          });
        }
        // Push unread count update to receiver (badge)
        await this.emitDmUnreadCount(data.receiverId, senderId);
      } else {
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

      if (receiverSocket && receiverSocket.size) {
        // ✅ Debug: Log userId

        // ✅ Import Types from mongoose and convert userId to ObjectId
        const { Types } = require('mongoose');
        const userObjectId = new Types.ObjectId(userId);

        // Get sender's profile to send username
        const senderProfile = await this.profileModel
          .findOne({ userId: userObjectId })
          .select('username displayName avatarUrl')
          .lean()
          .exec();


        const username =
          senderProfile?.username || senderProfile?.displayName || 'Unknown';


        for (const sid of receiverSocket) {
          this.server.to(sid).emit('user-typing', {
            fromUserId: userId,
            username,
            isTyping: data.isTyping,
          });
        }
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
      if (senderSocket && senderSocket.size) {
        for (const sid of senderSocket) {
          this.server.to(sid).emit('messages-read', {
            byUserId: userId,
            messageIds: data.messageIds,
          });
        }
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
      if (senderSocket && senderSocket.size) {
        for (const sid of senderSocket) {
          this.server.to(sid).emit('messages-read', {
            byUserId: userId,
            messageIds: [],
            all: true,
          });
        }
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
      if (receiverSocket && receiverSocket.size) {
        for (const sid of receiverSocket) {
          this.server.to(sid).emit('reaction-added', {
            messageId: data.messageId,
            emoji: data.emoji,
            userId,
            reactions: message.reactions,
          });
        }
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
      if (data.receiverId === senderId) {
        console.warn('📞 [CALL] Ignoring call-initiate to self');
        return;
      }
      const receiverSocket = this.connectedUsers.get(data.receiverId);

      // Get sender's profile for username and avatar
      const { Types } = require('mongoose');
      const senderObjectId = new Types.ObjectId(senderId);


      const senderProfile = await this.profileModel.findOne({
        userId: senderObjectId,
      });


      const callerInfo = {
        userId: senderId,
        username:
          senderProfile?.username || senderProfile?.displayName || 'User',
        displayName:
          senderProfile?.displayName || senderProfile?.username || 'User',
        avatar: senderProfile?.avatarUrl || null,
      };


      if (receiverSocket && receiverSocket.size) {
        const payload = {
          from: senderId,
          type: data.type,
          callerInfo,
        };


        for (const sid of receiverSocket) {
          this.server.to(sid).emit('call-incoming', payload);
        }

      } else {
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

    if (callerSocket && callerSocket.size) {
      for (const sid of callerSocket) {
        this.server.to(sid).emit('call-answer', {
          from: userId,
          sdpOffer: data.sdpOffer,
        });
      }
    }
  }

  @SubscribeMessage('call-reject')
  handleCallReject(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { callerId: string },
  ) {
    const userId = socket.data.userId;
    const callerSocket = this.connectedUsers.get(data.callerId);

    if (callerSocket && callerSocket.size) {
      for (const sid of callerSocket) {
        this.server.to(sid).emit('call-rejected', {
          from: userId,
        });
      }
    }
  }

  @SubscribeMessage('ice-candidate')
  handleIceCandidate(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { peerId: string; candidate: any },
  ) {
    const userId = socket.data.userId;
    const peerSocket = this.connectedUsers.get(data.peerId);

    if (peerSocket && peerSocket.size) {
      for (const sid of peerSocket) {
        this.server.to(sid).emit('ice-candidate', {
          from: userId,
          candidate: data.candidate,
        });
      }
    }
  }

  @SubscribeMessage('call-end')
  handleCallEnd(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { peerId: string },
  ) {
    const userId = socket.data.userId;
    const peerSocket = this.connectedUsers.get(data.peerId);


    if (peerSocket && peerSocket.size) {
      for (const sid of peerSocket) {
        this.server.to(sid).emit('call-ended', {
          from: userId,
        });
      }
    } else {
    }
  }

  getConnectedUsers() {
    return Array.from(this.connectedUsers.keys());
  }

  getSocketIdByUserId(userId: string) {
    return this.getSocketIdsByUserId(userId)[0];
  }

  emitToUser(userId: string, event: string, payload: any): void {
    const sockets = this.connectedUsers.get(userId);
    if (!sockets || sockets.size === 0) return;
    for (const socketId of sockets) {
      this.server.to(socketId).emit(event, payload);
    }
  }
}
