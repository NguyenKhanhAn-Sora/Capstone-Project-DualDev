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
import { FcmPushService } from '../notifications/fcm-push.service';
import { DmCallSessionService } from '../dm-call/dm-call-session.service';
import {
  DmCallClientPlatform,
  DmCallSessionRecord,
} from '../dm-call/dm-call.types';

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

  private emitCallBusy(
    socket: Socket,
    payload: {
      code: 'already_in_call' | 'peer_busy' | 'user_busy';
      receiverId?: string;
      peerId?: string;
    },
  ): void {
    socket.emit('call-busy', payload);
  }

  /** Emit to every socket of a user (multi-tab / multi-device on same gateway). */
  private emitToAllUserSockets(
    userId: string,
    event: string,
    payload: unknown,
    exceptSocketId?: string,
  ): void {
    const sockets = this.connectedUsers.get(userId);
    if (!sockets?.size) return;
    for (const sid of sockets) {
      if (exceptSocketId && sid === exceptSocketId) continue;
      this.server.to(sid).emit(event, payload);
    }
  }

  private async emitCallSessionsSync(userId: string, socket: Socket): Promise<void> {
    const sessions = await this.dmCallSessions.getSessionsForUser(userId);
    socket.emit('call-sessions-sync', { sessions });
  }

  private async onCallRingTimeout(session: DmCallSessionRecord): Promise<void> {
    this.emitToAllUserSockets(session.calleeId, 'call-ended', {
      from: session.initiatorId,
      callId: session.callId,
      reason: 'timeout',
    });
    this.emitToAllUserSockets(session.initiatorId, 'call-ended', {
      from: session.calleeId,
      callId: session.callId,
      reason: 'timeout',
    });
    await this.finalizeFromSession(session, session.initiatorId, 'missed');
  }

  private async persistCallLogAndNotify(params: {
    initiatorId: string;
    peerId: string;
    callType: 'audio' | 'video';
    callStatus: 'missed' | 'completed' | 'declined' | 'cancelled';
    durationSec?: number;
  }): Promise<void> {
    try {
      const message = await this.directMessagesService.createCallLogMessage({
        initiatorId: params.initiatorId,
        peerId: params.peerId,
        callType: params.callType,
        callStatus: params.callStatus,
        durationSec: params.durationSec,
      });

      const populatedMessage =
        await this.directMessagesService.getDirectMessageById(
          message._id.toString(),
        );

      const senderId = params.initiatorId;
      const receiverId = params.peerId;

      const receiverSockets = this.connectedUsers.get(receiverId);
      if (receiverSockets?.size) {
        for (const sid of receiverSockets) {
          this.server.to(sid).emit('new-message', {
            message: populatedMessage,
            fromUser: {
              userId: senderId,
              username:
                (populatedMessage as any).senderId?.['username'] ?? 'User',
            },
          });
        }
        await this.emitDmUnreadCount(receiverId, senderId);
      }

      const initiatorSockets = this.connectedUsers.get(senderId);
      if (initiatorSockets?.size) {
        for (const sid of initiatorSockets) {
          this.server.to(sid).emit('message-sent', {
            message: populatedMessage,
          });
        }
      }
    } catch (error) {
      console.error('❌ [CALL] Failed to persist call log message:', error);
    }
  }

  private async finalizeFromSession(
    session: DmCallSessionRecord,
    endedByUserId: string,
    explicitStatus?: 'missed' | 'completed' | 'declined' | 'cancelled',
  ): Promise<void> {
    if (this.dmCallSessions.wasCallLogPersisted(session.callId)) return;
    this.dmCallSessions.markCallLogPersisted(session.callId);

    const { initiatorId, calleeId, type, answeredAt } = session;
    const peerId = calleeId;

    let callStatus: 'missed' | 'completed' | 'declined' | 'cancelled';
    let durationSec: number | undefined;

    if (explicitStatus) {
      callStatus = explicitStatus;
    } else if (answeredAt) {
      callStatus = 'completed';
      durationSec = Math.max(
        1,
        Math.floor((Date.now() - answeredAt) / 1000),
      );
    } else if (endedByUserId === calleeId) {
      callStatus = 'declined';
    } else if (endedByUserId === initiatorId) {
      callStatus = 'cancelled';
    } else {
      callStatus = 'missed';
    }

    if (callStatus === 'cancelled' && answeredAt) {
      callStatus = 'completed';
      durationSec = Math.max(
        1,
        Math.floor((Date.now() - answeredAt) / 1000),
      );
    }

    await this.persistCallLogAndNotify({
      initiatorId,
      peerId,
      callType: type,
      callStatus,
      durationSec,
    });
  }

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

  private presenceLastActiveIso(userId: string): string | null {
    const rec = this.presence.get(userId);
    if (!rec?.lastActiveAt) return null;
    return new Date(rec.lastActiveAt).toISOString();
  }

  private notifyPresenceToSubscribers(
    targetUserId: string,
    status: 'online' | 'idle' | 'offline',
  ) {
    const lastActiveAt = this.presenceLastActiveIso(targetUserId);
    for (const [watcherId, targets] of this.dmPresenceSubs.entries()) {
      if (!targets?.has(targetUserId)) continue;
      const watcherSockets = this.connectedUsers.get(watcherId);
      if (!watcherSockets || watcherSockets.size === 0) continue;
      for (const sid of watcherSockets) {
        this.server.to(sid).emit('presence-updated', {
          userId: targetUserId,
          status,
          lastActiveAt,
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
    const prev = this.presence.get(userId) ?? {
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
      this.server.emit('presence-updated', {
        userId,
        status: next,
        lastActiveAt: this.presenceLastActiveIso(userId),
      });
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

  emitMessageDeleted(payload: {
    messageId: string;
    senderId: string;
    receiverId: string;
    deleteType: 'for-everyone' | 'for-me';
    deletedAt: string;
  }) {
    if (!this.server) {
      return;
    }
    const body = {
      messageId: payload.messageId,
      deleteType: payload.deleteType,
      deletedAt: payload.deletedAt,
      senderId: payload.senderId,
      receiverId: payload.receiverId,
      // Back-compat alias per spec: { type: "message_unsent", messageId }
      type: 'message_unsent',
    };

    // Send to both participants so every open client updates instantly.
    for (const uid of [payload.senderId, payload.receiverId]) {
      const sockets = this.connectedUsers.get(uid);
      if (!sockets || sockets.size === 0) continue;
      for (const sid of sockets) {
        this.server.to(sid).emit('message-deleted', body);
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
    private readonly fcmPushService: FcmPushService,
    private readonly dmCallSessions: DmCallSessionService,
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

      await this.emitCallSessionsSync(userId, socket);
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
        const endedSessions =
          await this.dmCallSessions.onInitiatorFullyOffline(userId);
        for (const session of endedSessions) {
          this.emitToAllUserSockets(session.calleeId, 'call-ended', {
            from: session.initiatorId,
            callId: session.callId,
            reason: 'cancelled',
          });
          await this.finalizeFromSession(
            session,
            session.initiatorId,
            'cancelled',
          );
        }
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

    const needDbLastSeen: string[] = [];
    const snapshot = ids.map((targetId) => {
      const rec = this.presence.get(targetId);
      const status = this.effectiveStatusForViewer(targetId);
      let lastActiveAt = this.presenceLastActiveIso(targetId);
      if (!lastActiveAt && status === 'offline') {
        needDbLastSeen.push(targetId);
      }
      return { userId: targetId, status, lastActiveAt };
    });

    if (needDbLastSeen.length > 0) {
      try {
        const fromDb =
          await this.directMessagesService.getLastSeenAtByUserIds(
            needDbLastSeen,
          );
        for (const item of snapshot) {
          if (!item.lastActiveAt && fromDb[item.userId]) {
            item.lastActiveAt = fromDb[item.userId];
          }
        }
      } catch {
        // ignore DB fallback errors
      }
    }

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

  @SubscribeMessage('delete-message')
  async handleDeleteMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    data: {
      messageId: string;
      deleteType?: 'for-everyone' | 'for-me';
      receiverId?: string;
    },
  ) {
    try {
      const userId = socket.data.userId;
      if (!userId || !data?.messageId) return;
      const requested = data.deleteType;
      const deleteType: 'for-everyone' | 'for-me' =
        requested === 'for-everyone' ? 'for-everyone' : 'for-me';

      // Service is idempotent, so double-invoking (REST + socket) is safe.
      const result = await this.directMessagesService.deleteDirectMessage(
        data.messageId,
        userId,
        deleteType,
      );

      if (result.deleteType === 'for-everyone') {
        this.emitMessageDeleted({
          messageId: result.messageId,
          senderId: result.senderId,
          receiverId: result.receiverId,
          deleteType: 'for-everyone',
          deletedAt: result.deletedAt.toISOString(),
        });
      }
    } catch (error) {
      console.error('Error handling delete-message socket event:', error);
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
    @MessageBody()
    data: {
      receiverId: string;
      type: 'audio' | 'video';
      clientPlatform?: DmCallClientPlatform;
    },
  ) {
    try {
      const senderId = socket.data.userId;
      if (data.receiverId === senderId) {
        console.warn('📞 [CALL] Ignoring call-initiate to self');
        return;
      }

      const outcome = await this.dmCallSessions.tryInitiate({
        initiatorId: senderId,
        calleeId: data.receiverId,
        type: data.type,
        initiatorSocketId: socket.id,
        platform: data.clientPlatform,
        onRingTimeout: (s) => void this.onCallRingTimeout(s),
      });

      if (!outcome.ok) {
        this.emitCallBusy(socket, {
          code: outcome.code,
          receiverId: data.receiverId,
          peerId: outcome.peerId,
        });
        return;
      }

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

      const incomingPayload = {
        from: senderId,
        type: data.type,
        callerInfo,
        callId: outcome.callId,
      };

      this.emitToAllUserSockets(
        data.receiverId,
        'call-incoming',
        incomingPayload,
      );
      // Always FCM as well: mobile may be foreground without DM socket while a
      // web tab still holds an online socket for this user.
      void this.fcmPushService.pushDmCallIncoming({
        receiverUserId: data.receiverId,
        callerUserId: senderId,
        type: data.type,
        callerInfo,
        callId: outcome.callId,
      });

      this.emitToAllUserSockets(senderId, 'call-sessions-sync', {
        sessions: await this.dmCallSessions.getSessionsForUser(senderId),
      });
    } catch (error) {
      console.error('❌ [CALL] Error initiating call:', error);
    }
  }

  @SubscribeMessage('call-answer')
  async handleCallAnswer(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { callerId: string; sdpOffer: any },
  ) {
    const userId = socket.data.userId;
    const roomId =
      typeof data.sdpOffer?.roomName === 'string'
        ? data.sdpOffer.roomName
        : undefined;

    const session = await this.dmCallSessions.markAnswered({
      userId,
      callerId: data.callerId,
      answeringSocketId: socket.id,
      roomId,
    });

    const answerPayload = {
      from: userId,
      sdpOffer: data.sdpOffer,
      callId: session?.callId,
    };

    this.emitToAllUserSockets(data.callerId, 'call-answer', answerPayload);

    this.emitToAllUserSockets(
      userId,
      'call-incoming-dismiss',
      {
        peerId: data.callerId,
        callId: session?.callId,
        reason: 'answered_elsewhere',
      },
      socket.id,
    );

    if (session) {
      this.emitToAllUserSockets(data.callerId, 'call-sessions-sync', {
        sessions: await this.dmCallSessions.getSessionsForUser(data.callerId),
      });
      this.emitToAllUserSockets(userId, 'call-sessions-sync', {
        sessions: await this.dmCallSessions.getSessionsForUser(userId),
      });
    }
  }

  @SubscribeMessage('call-reject')
  async handleCallReject(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { callerId: string },
  ) {
    const userId = socket.data.userId;

    this.emitToAllUserSockets(data.callerId, 'call-rejected', {
      from: userId,
    });

    this.emitToAllUserSockets(
      userId,
      'call-incoming-dismiss',
      {
        peerId: data.callerId,
        reason: 'rejected_elsewhere',
      },
      socket.id,
    );

    const session = await this.dmCallSessions.markEnded({
      userId,
      peerId: data.callerId,
      explicitStatus: 'declined',
    });
    if (session) {
      await this.finalizeFromSession(session, userId, 'declined');
    }
  }

  @SubscribeMessage('call-heartbeat')
  async handleCallHeartbeat(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { callId: string },
  ) {
    const userId = socket.data.userId;
    if (!data?.callId) return;
    const ok = await this.dmCallSessions.heartbeat(data.callId, userId);
    if (!ok) {
      socket.emit('call-ended', { from: null, reason: 'session_gone' });
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
  async handleCallEnd(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    data: {
      peerId: string;
      status?: 'missed' | 'completed' | 'declined' | 'cancelled';
      durationSec?: number;
    },
  ) {
    const userId = socket.data.userId;

    const endedPayload = {
      from: userId,
      reason: data.status ?? 'ended',
    };
    this.emitToAllUserSockets(data.peerId, 'call-ended', endedPayload);
    this.emitToAllUserSockets(userId, 'call-ended', {
      from: data.peerId,
      reason: data.status ?? 'ended',
    });

    const session = await this.dmCallSessions.markEnded({
      userId,
      peerId: data.peerId,
      explicitStatus: data.status,
    });

    if (!session) return;

    if (data.status === 'completed' && session.answeredAt) {
      if (this.dmCallSessions.wasCallLogPersisted(session.callId)) return;
      this.dmCallSessions.markCallLogPersisted(session.callId);
      const durationSec =
        data.durationSec ??
        Math.max(1, Math.floor((Date.now() - session.answeredAt) / 1000));
      await this.persistCallLogAndNotify({
        initiatorId: session.initiatorId,
        peerId: session.calleeId,
        callType: session.type,
        callStatus: 'completed',
        durationSec,
      });
      return;
    }

    await this.finalizeFromSession(session, userId, data.status);
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
