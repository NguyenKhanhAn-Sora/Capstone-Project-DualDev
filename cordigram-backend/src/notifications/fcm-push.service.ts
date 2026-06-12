import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { User } from '../users/user.schema';
import { ConfigService } from '../config/config.service';
import type { NotificationItem } from './notifications.service';

type InboxForYouPushPayload = {
  type: 'event' | 'server_notification';
  _id: string;
  serverId: string;
  serverName: string;
  serverAvatarUrl?: string | null;
  title?: string;
  content?: string;
  topic?: string;
  startAt?: string;
  endAt?: string;
};

@Injectable()
export class FcmPushService {
  private readonly logger = new Logger(FcmPushService.name);
  private app: admin.app.App | null = null;
  private static readonly androidNotificationIcon = 'ic_stat_cordigram';
  private static readonly channelHigh = 'cordigram_push_high';
  private static readonly channelMessages = 'cordigram_push_messages';
  private static readonly channelCalls = 'cordigram_push_calls';

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly config: ConfigService,
  ) {
    this.init();
  }

  get enabled(): boolean {
    return this.app != null;
  }

  private async getFcmTokensForUser(userId: string): Promise<string[]> {
    const user = await this.userModel
      .findById(userId)
      .select('loginDevices.fcmToken')
      .lean()
      .exec();

    return Array.from(
      new Set(
        (user?.loginDevices ?? [])
          .map((d) => d?.fcmToken?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    );
  }

  private async clearInvalidTokens(
    userId: string,
    invalidTokens: string[],
  ): Promise<void> {
    if (!invalidTokens.length) return;
    const invalidSet = new Set(invalidTokens);
    await this.userModel
      .updateOne(
        { _id: userId },
        {
          $unset: {
            'loginDevices.$[elem].fcmToken': '',
          },
        },
        {
          arrayFilters: [{ 'elem.fcmToken': { $in: [...invalidSet] } }],
        },
      )
      .exec()
      .catch(() => undefined);
  }

  private async sendToUser(
    userId: string,
    message: Omit<admin.messaging.MulticastMessage, 'tokens'>,
    context?: string,
  ): Promise<void> {
    if (!this.app) {
      if (context) {
        this.logger.warn(`FCM skipped (${context}): service not initialized`);
      }
      return;
    }

    const tokens = await this.getFcmTokensForUser(userId);
    if (!tokens.length) {
      if (context) {
        this.logger.warn(
          `FCM skipped (${context}): no tokens registered for user ${userId}`,
        );
      }
      return;
    }

    try {
      const result = await this.app.messaging().sendEachForMulticast({
        ...message,
        tokens,
      });

      const invalid: string[] = [];
      result.responses.forEach((resp, index) => {
        if (resp.success) return;
        const code = resp.error?.code ?? '';
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          invalid.push(tokens[index]);
        }
      });
      if (invalid.length) {
        await this.clearInvalidTokens(userId, invalid);
      }
    } catch (err) {
      this.logger.warn(
        `Failed to send FCM to user ${userId}: ${(err as Error).message}`,
      );
    }
  }

  private androidHigh(channelId: string) {
    return {
      priority: 'high' as const,
      notification: {
        channelId,
        icon: FcmPushService.androidNotificationIcon,
        priority: 'high' as const,
        visibility: 'public' as const,
      },
    };
  }

  private apnsDefault() {
    return {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
        },
      },
    };
  }

  /**
   * Wakes mobile when callee has no DM socket. Data keys match
   * cordigram-mobile PushNotificationService.
   */
  async pushDmCallIncoming(params: {
    receiverUserId: string;
    callerUserId: string;
    type: 'audio' | 'video';
    callId?: string;
    callerInfo: {
      userId: string;
      username: string;
      displayName: string;
      avatar: string | null;
    };
  }): Promise<void> {
    const label =
      params.callerInfo.displayName?.trim() ||
      params.callerInfo.username?.trim() ||
      'Someone';
    const video = params.type === 'video';

    const data: Record<string, string> = {
      scope: 'messages',
      type: 'dm_call_incoming',
      callerUserId: params.callerUserId,
      fromUserId: params.callerUserId,
      video: video ? 'true' : 'false',
      callType: params.type,
      callerName: label,
      callerUsername: (params.callerInfo.username ?? '').trim(),
      callerDisplayName: (params.callerInfo.displayName ?? '').trim(),
      callerAvatar: (params.callerInfo.avatar ?? '').trim(),
      ...(params.callId ? { callId: params.callId } : {}),
    };

    await this.sendToUser(params.receiverUserId, {
      notification: {
        title: 'Incoming call',
        body: video ? `${label} — video call` : `${label} — voice call`,
      },
      data,
      android: this.androidHigh(FcmPushService.channelCalls),
      apns: this.apnsDefault(),
    }, 'dm_call_incoming');
  }

  /** Cancel incoming-call notification on answer/reject/timeout. */
  async pushDmCallDismiss(params: {
    receiverUserId: string;
    callId?: string;
    callerUserId?: string;
  }): Promise<void> {
    const data: Record<string, string> = {
      scope: 'messages',
      type: 'dm_call_dismiss',
      ...(params.callId ? { callId: params.callId } : {}),
      ...(params.callerUserId ? { callerUserId: params.callerUserId } : {}),
    };

    await this.sendToUser(params.receiverUserId, {
      data,
      android: { priority: 'high' },
      apns: { payload: { aps: { 'content-available': 1 } } },
    }, 'dm_call_dismiss');
  }

  async pushDmMessage(params: {
    receiverUserId: string;
    senderUserId: string;
    messageId: string;
    senderName: string;
    senderUsername?: string;
    senderAvatarUrl?: string | null;
    excerpt: string;
  }): Promise<void> {
    const label = params.senderName?.trim() || 'New message';
    const body = (params.excerpt ?? '').trim().slice(0, 200) || 'Sent you a message';

    const data: Record<string, string> = {
      scope: 'messages',
      type: 'dm_message',
      messageId: params.messageId,
      senderUserId: params.senderUserId,
      peerUserId: params.senderUserId,
      senderName: label,
      senderUsername: (params.senderUsername ?? '').trim(),
      senderAvatarUrl: (params.senderAvatarUrl ?? '').trim(),
      excerpt: body,
    };

    await this.sendToUser(params.receiverUserId, {
      notification: {
        title: label,
        body,
      },
      data,
      android: this.androidHigh(FcmPushService.channelMessages),
      apns: this.apnsDefault(),
    }, 'dm_message');
  }

  async pushChannelMention(params: {
    userId: string;
    serverId: string;
    serverName: string;
    serverAvatarUrl?: string | null;
    channelId: string;
    channelName: string;
    messageId: string;
    senderName: string;
    senderAvatarUrl?: string | null;
    excerpt: string;
  }): Promise<void> {
    const serverName = params.serverName?.trim() || 'Server';
    const channelName = params.channelName?.trim() || 'general';
    const senderName = params.senderName?.trim() || 'Someone';
    const title = `${senderName} (#${channelName}, ${serverName})`;
    const body = (params.excerpt ?? '').trim().slice(0, 200) || 'You were mentioned';

    const data: Record<string, string> = {
      scope: 'messages',
      type: 'channel_mention',
      serverId: params.serverId,
      serverName,
      serverAvatarUrl: (params.serverAvatarUrl ?? '').trim(),
      channelId: params.channelId,
      channelName,
      messageId: params.messageId,
      senderName,
      senderAvatarUrl: (params.senderAvatarUrl ?? '').trim(),
      excerpt: body,
      isMention: 'true',
    };

    await this.sendToUser(params.userId, {
      notification: { title, body },
      data,
      android: this.androidHigh(FcmPushService.channelMessages),
      apns: this.apnsDefault(),
    }, 'channel_mention');
  }

  async pushInboxForYouItem(
    userId: string,
    payload: InboxForYouPushPayload,
  ): Promise<void> {
    if (payload.type === 'event') {
      const topic = payload.topic?.trim() || 'Event';
      const serverName = payload.serverName?.trim() || 'Server';
      const title = `New event · ${serverName}`;
      const body = topic;

      const data: Record<string, string> = {
        scope: 'messages',
        type: 'event',
        _id: payload._id,
        serverId: payload.serverId,
        serverName,
        serverAvatarUrl: (payload.serverAvatarUrl ?? '').trim(),
        topic,
        startAt: payload.startAt ?? '',
        endAt: payload.endAt ?? '',
      };

      await this.sendToUser(userId, {
        notification: { title, body },
        data,
        android: this.androidHigh(FcmPushService.channelMessages),
        apns: this.apnsDefault(),
      }, 'event');
      return;
    }

    const serverName = payload.serverName?.trim() || 'Server';
    const title = payload.title?.trim() || 'Announcement';
    const content = payload.content?.trim().slice(0, 200) || '';

    const data: Record<string, string> = {
      scope: 'messages',
      type: 'server_notification',
      _id: payload._id,
      serverId: payload.serverId,
      serverName,
      serverAvatarUrl: (payload.serverAvatarUrl ?? '').trim(),
      title,
      content,
    };

    await this.sendToUser(userId, {
      notification: {
        title: `${serverName}`,
        body: content ? `${title} — ${content}` : title,
      },
      data,
      android: this.androidHigh(FcmPushService.channelMessages),
      apns: this.apnsDefault(),
    }, 'server_notification');
  }

  async pushInboxForYouItemToUsers(
    userIds: string[],
    payload: InboxForYouPushPayload,
    excludeUserId?: string,
  ): Promise<void> {
    const seen = new Set<string>();
    for (const raw of userIds) {
      const uid = String(raw ?? '').trim();
      if (!uid || seen.has(uid)) continue;
      if (excludeUserId && uid === excludeUserId) continue;
      seen.add(uid);
      await this.pushInboxForYouItem(uid, payload);
    }
  }

  async pushNotificationToUser(
    userId: string,
    item: NotificationItem,
  ): Promise<void> {
    const message = this.buildMessage(item);
    await this.sendToUser(userId, message);
  }

  private init(): void {
    const cred = this.loadServiceAccount();
    if (!cred) {
      this.logger.warn(
        'FCM disabled: missing FCM_SERVICE_ACCOUNT_JSON or FCM_SERVICE_ACCOUNT_PATH.',
      );
      return;
    }

    try {
      this.app = admin.initializeApp(
        {
          credential: admin.credential.cert(cred),
        },
        'cordigram-fcm',
      );
      this.logger.log('FCM push service initialized.');
    } catch (err) {
      this.logger.error(
        `Failed to initialize FCM push service: ${(err as Error).message}`,
      );
      this.app = null;
    }
  }

  private loadServiceAccount(): admin.ServiceAccount | null {
    const rawJson = this.config.fcmServiceAccountJson;
    if (rawJson) {
      try {
        const parsed = JSON.parse(rawJson) as admin.ServiceAccount;
        if (parsed.privateKey) {
          parsed.privateKey = parsed.privateKey.replace(/\\n/g, '\n');
        }
        return parsed;
      } catch (_err) {
        this.logger.error('Invalid FCM_SERVICE_ACCOUNT_JSON content.');
        return null;
      }
    }

    const path = this.config.fcmServiceAccountPath;
    if (!path) return null;

    try {
      const absolutePath = resolve(path);
      const fileContent = readFileSync(absolutePath, 'utf8');
      const parsed = JSON.parse(fileContent) as admin.ServiceAccount;
      if (parsed.privateKey) {
        parsed.privateKey = parsed.privateKey.replace(/\\n/g, '\n');
      }
      return parsed;
    } catch (_err) {
      this.logger.error('Cannot read FCM service account file.');
      return null;
    }
  }

  private buildMessage(
    item: NotificationItem,
  ): Omit<admin.messaging.MulticastMessage, 'tokens'> {
    const title = this.titleFor(item);
    const body = this.bodyFor(item);

    return {
      notification: {
        title,
        body,
      },
      data: {
        scope: 'social',
        notificationId: item.id,
        type: item.type,
        actorId: item.actor.id,
        actorUsername: item.actor.username,
        actorDisplayName: item.actor.displayName,
        postId: item.postId ?? '',
        commentId: item.commentId ?? '',
        postKind: item.postKind,
        mentionSource: item.mentionSource,
      },
      android: this.androidHigh(FcmPushService.channelHigh),
      apns: this.apnsDefault(),
    };
  }

  private titleFor(item: NotificationItem): string {
    switch (item.type) {
      case 'follow':
        return 'Cordigram';
      case 'post_like':
      case 'comment_like':
        return 'Cordigram';
      case 'post_comment':
      case 'comment_reply':
        return 'Cordigram';
      case 'post_mention':
        return 'Cordigram';
      case 'login_alert':
        return 'Security alert';
      case 'post_moderation':
        return 'Moderation update';
      case 'report':
        return 'Report update';
      case 'system_notice':
        return item.systemNoticeTitle?.trim().length
          ? item.systemNoticeTitle.trim()
          : 'System notice';
      default:
        return 'New notification';
    }
  }

  private bodyFor(item: NotificationItem): string {
    if (item.type == 'system_notice') {
      return item.systemNoticeBody?.trim().length
        ? item.systemNoticeBody.trim()
        : 'You have a new system notice.';
    }

    const actorName = item.actor.username.trim().length
      ? `@${item.actor.username.trim()}`
      : item.actor.displayName.trim().length
        ? item.actor.displayName.trim()
        : 'Someone';

    switch (item.type) {
      case 'follow':
        return `${actorName} started following you.`;
      case 'post_like':
        return `${actorName} liked your post.`;
      case 'comment_like':
        return `${actorName} liked your comment.`;
      case 'post_comment':
        return `${actorName} commented on your post.`;
      case 'comment_reply':
        return `${actorName} replied to your comment.`;
      case 'post_mention':
        return `${actorName} mentioned you.`;
      case 'login_alert':
        return 'A new login was detected on your account.';
      case 'post_moderation':
        return 'Your post moderation status has been updated.';
      case 'report':
        return 'Your report has been reviewed.';
      default:
        return 'You have a new notification.';
    }
  }
}
