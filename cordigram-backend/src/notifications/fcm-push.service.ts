import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { User } from '../users/user.schema';
import { ConfigService } from '../config/config.service';
import type { NotificationItem } from './notifications.service';

@Injectable()
export class FcmPushService {
  private readonly logger = new Logger(FcmPushService.name);
  private app: admin.app.App | null = null;
  private static readonly androidNotificationIcon = 'ic_stat_cordigram';

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

  /**
   * Wakes the mobile app when the callee has no DM socket (app killed /
   * background). Data keys match cordigram-mobile PushNotificationService
   * (`dm_call_incoming`, callerUserId, video, …). FCM `data` values must be
   * strings for Android.
   */
  async pushDmCallIncoming(params: {
    receiverUserId: string;
    callerUserId: string;
    type: 'audio' | 'video';
    callerInfo: {
      userId: string;
      username: string;
      displayName: string;
      avatar: string | null;
    };
  }): Promise<void> {
    if (!this.app) return;

    const tokens = await this.getFcmTokensForUser(params.receiverUserId);
    if (!tokens.length) return;

    const label =
      params.callerInfo.displayName?.trim() ||
      params.callerInfo.username?.trim() ||
      'Someone';
    const video = params.type === 'video';

    const data: Record<string, string> = {
      type: 'dm_call_incoming',
      callerUserId: params.callerUserId,
      fromUserId: params.callerUserId,
      video: video ? 'true' : 'false',
      callType: params.type,
      callerName: label,
      callerUsername: (params.callerInfo.username ?? '').trim(),
      callerDisplayName: (params.callerInfo.displayName ?? '').trim(),
      callerAvatar: (params.callerInfo.avatar ?? '').trim(),
    };

    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: {
        title: 'Incoming call',
        body: video ? `${label} — video call` : `${label} — voice call`,
      },
      data,
      android: {
        priority: 'high',
        notification: {
          channelId: 'cordigram_push_high',
          icon: FcmPushService.androidNotificationIcon,
          priority: 'high',
          visibility: 'public',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    try {
      await this.app.messaging().sendEachForMulticast(message);
    } catch (err) {
      this.logger.warn(
        `Failed to send DM call FCM to user ${params.receiverUserId}: ${(err as Error).message}`,
      );
    }
  }

  async pushNotificationToUser(
    userId: string,
    item: NotificationItem,
  ): Promise<void> {
    if (!this.app) return;

    const tokens = await this.getFcmTokensForUser(userId);

    if (!tokens.length) return;

    const message = this.buildMessage(item, tokens);

    try {
      await this.app.messaging().sendEachForMulticast(message);
    } catch (err) {
      this.logger.warn(
        `Failed to send FCM notification to user ${userId}: ${(err as Error).message}`,
      );
    }
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
    tokens: string[],
  ): admin.messaging.MulticastMessage {
    const title = this.titleFor(item);
    const body = this.bodyFor(item);

    return {
      tokens,
      notification: {
        title,
        body,
      },
      data: {
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
      android: {
        priority: 'high',
        notification: {
          channelId: 'cordigram_push_high',
          icon: FcmPushService.androidNotificationIcon,
          priority: 'high',
          visibility: 'public',
        },
      },
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
