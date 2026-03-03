import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationType,
  ReportNotificationAudience,
  ReportNotificationOutcome,
  ReportNotificationSeverity,
  ReportNotificationTargetType,
} from './notification.schema';
import type { PostKind } from '../posts/post.schema';
import { Profile } from '../profiles/profile.schema';
import { NotificationsGateway } from './notifications.gateway';
import { User } from '../users/user.schema';
import { Post } from '../posts/post.schema';

const DEFAULT_AVATAR_URL =
  'https://res.cloudinary.com/doicocgeo/image/upload/v1765850274/user-avatar-default_gfx5bs.jpg';

export type NotificationActor = {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string;
};

export type NotificationItem = {
  id: string;
  type: NotificationType;
  actor: NotificationActor;
  postId: string | null;
  commentId: string | null;
  postKind: PostKind;
  isOwnPost?: boolean;
  postMutedUntil?: string | null;
  postMutedIndefinitely?: boolean;
  likeCount: number;
  commentCount: number;
  mentionCount: number;
  mentionSource: 'post' | 'comment';
  reportOutcome?: ReportNotificationOutcome | null;
  reportAudience?: ReportNotificationAudience | null;
  reportTargetType?: ReportNotificationTargetType | null;
  reportAction?: string | null;
  reportTargetId?: string | null;
  reportSeverity?: ReportNotificationSeverity | null;
  reportStrikeDelta?: number | null;
  reportStrikeTotal?: number | null;
  reportReason?: string | null;
  reportActionExpiresAt?: string | null;
  moderationDecision?: 'approve' | 'blur' | 'reject' | null;
  moderationReasons?: string[];
  readAt: string | null;
  createdAt: string;
  activityAt: string;
  deviceInfo?: string;
  deviceType?: string;
  os?: string;
  browser?: string;
  location?: string;
  ip?: string;
  deviceIdHash?: string;
  loginAt?: string | null;
};

export type NotificationRealtimePayload = {
  notification: NotificationItem;
  unreadCount: number;
};

export type ForceLogoutPayload = {
  reason: 'suspended' | 'session_revoked';
  at: string;
};

type NotificationDoc = {
  _id: Types.ObjectId;
  type: NotificationType;
  actorId?: Types.ObjectId | null;
  postId?: Types.ObjectId | null;
  commentId?: Types.ObjectId | null;
  postKind?: PostKind;
  deviceInfo?: string;
  deviceType?: string;
  os?: string;
  browser?: string;
  location?: string;
  ip?: string;
  deviceIdHash?: string;
  loginAt?: Date | null;
  likeCount?: number;
  commentCount?: number;
  commentActorIds?: Types.ObjectId[];
  mentionCount?: number;
  mentionActorIds?: Types.ObjectId[];
  mentionSource?: 'post' | 'comment';
  reportOutcome?: ReportNotificationOutcome | null;
  reportAudience?: ReportNotificationAudience | null;
  reportTargetType?: ReportNotificationTargetType | null;
  reportAction?: string | null;
  reportTargetId?: string | null;
  reportSeverity?: ReportNotificationSeverity | null;
  reportStrikeDelta?: number | null;
  reportStrikeTotal?: number | null;
  reportReason?: string | null;
  reportActionExpiresAt?: Date | null;
  moderationDecision?: 'approve' | 'blur' | 'reject' | null;
  moderationReasons?: string[];
  readAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type NotificationCategoryKey = 'follow' | 'comment' | 'like' | 'mentions';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,
    @InjectModel(Profile.name)
    private readonly profileModel: Model<Profile>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    private readonly gateway: NotificationsGateway,
  ) {}

  emitForceLogout(recipientId: string, reason: ForceLogoutPayload['reason']) {
    this.gateway.emitToUser(recipientId, 'auth:force_logout', {
      reason,
      at: new Date().toISOString(),
    } satisfies ForceLogoutPayload);
  }

  private async canEmitNotification(userId: string): Promise<boolean> {
    const user = await this.userModel
      .findById(userId)
      .select('settings.notifications')
      .lean()
      .exec();

    const mutedUntil = user?.settings?.notifications?.mutedUntil ?? null;
    const mutedIndefinitely =
      user?.settings?.notifications?.mutedIndefinitely ?? false;

    const now = new Date();

    if (mutedIndefinitely) {
      return false;
    }

    if (mutedUntil) {
      const mutedUntilDate = new Date(mutedUntil);
      if (mutedUntilDate.getTime() > now.getTime()) {
        return false;
      }

      await this.userModel
        .updateOne(
          { _id: userId },
          {
            $set: {
              'settings.notifications.mutedUntil': null,
              'settings.notifications.mutedIndefinitely': false,
            },
          },
        )
        .exec();
    }

    return true;
  }

  private async canEmitCategoryNotification(
    userId: string,
    category: NotificationCategoryKey,
  ): Promise<boolean> {
    const user = await this.userModel
      .findById(userId)
      .select('settings.notifications.categories')
      .lean()
      .exec();

    const settings =
      user?.settings?.notifications?.categories?.[category] ?? null;

    const mutedUntil = settings?.mutedUntil ?? null;
    const mutedIndefinitely = settings?.mutedIndefinitely ?? false;

    const now = new Date();

    if (mutedIndefinitely) {
      return false;
    }

    if (mutedUntil) {
      const mutedUntilDate = new Date(mutedUntil);
      if (mutedUntilDate.getTime() > now.getTime()) {
        return false;
      }

      await this.userModel
        .updateOne(
          { _id: userId },
          {
            $set: {
              [`settings.notifications.categories.${category}.mutedUntil`]:
                null,
              [`settings.notifications.categories.${category}.mutedIndefinitely`]: false,
            },
          },
        )
        .exec();
    }

    return true;
  }

  private async canEmitPostNotification(
    recipientId: string,
    postId?: string | null,
  ): Promise<boolean> {
    if (!postId) return true;
    const post = await this.postModel
      .findOne({ _id: new Types.ObjectId(postId), deletedAt: null })
      .select('authorId notificationsMutedUntil notificationsMutedIndefinitely')
      .lean();

    if (!post?.authorId) return true;
    if (post.authorId.toString() !== recipientId) return true;

    if (post.notificationsMutedIndefinitely) {
      return false;
    }

    if (post.notificationsMutedUntil) {
      const now = new Date();
      const mutedUntil = new Date(post.notificationsMutedUntil);
      if (mutedUntil.getTime() > now.getTime()) {
        return false;
      }

      await this.postModel
        .updateOne(
          { _id: post._id },
          {
            $set: {
              notificationsMutedUntil: null,
              notificationsMutedIndefinitely: false,
            },
          },
        )
        .exec();
    }

    return true;
  }

  async list(
    userId: string,
    limit = 30,
  ): Promise<{ items: NotificationItem[] }> {
    const recipientId = new Types.ObjectId(userId);
    const docs = await this.notificationModel
      .find({ recipientId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const postIds = Array.from(
      new Set(docs.map((doc) => doc.postId?.toString()).filter(Boolean)),
    ).map((id) => new Types.ObjectId(id));

    const posts = postIds.length
      ? await this.postModel
          .find({ _id: { $in: postIds } })
          .select(
            '_id authorId notificationsMutedUntil notificationsMutedIndefinitely',
          )
          .lean()
      : [];

    const postMap = new Map(posts.map((post) => [post._id.toString(), post]));

    const actorIds = Array.from(
      new Set(docs.map((doc) => doc.actorId?.toString()).filter(Boolean)),
    ).map((id) => new Types.ObjectId(id));

    const profiles = actorIds.length
      ? await this.profileModel
          .find({ userId: { $in: actorIds } })
          .select('userId displayName username avatarUrl')
          .lean()
      : [];

    const profileMap = new Map(
      profiles.map((profile) => [profile.userId.toString(), profile]),
    );

    const items = docs.map((doc) => {
      const actorId = doc.actorId?.toString();
      const profile = actorId ? (profileMap.get(actorId) ?? null) : null;
      const post = doc.postId ? postMap.get(doc.postId.toString()) : null;
      return this.toResponse(doc, profile, { recipientId: userId, post });
    });

    return { items };
  }

  async getLastSeenAt(userId: string): Promise<{ lastSeenAt: string | null }> {
    const user = await this.userModel
      .findById(userId)
      .select('settings.notifications.lastSeenAt')
      .lean()
      .exec();

    const lastSeenAt = user?.settings?.notifications?.lastSeenAt ?? null;
    return {
      lastSeenAt: lastSeenAt ? new Date(lastSeenAt).toISOString() : null,
    };
  }

  async setLastSeenAt(
    userId: string,
    seenAt = new Date(),
  ): Promise<{ lastSeenAt: string }> {
    await this.userModel
      .updateOne(
        { _id: userId },
        { $set: { 'settings.notifications.lastSeenAt': seenAt } },
      )
      .exec();

    return { lastSeenAt: seenAt.toISOString() };
  }

  async getUnreadCount(userId: string): Promise<{ unreadCount: number }> {
    const recipientId = new Types.ObjectId(userId);
    const unreadCount = await this.notificationModel.countDocuments({
      recipientId,
      readAt: null,
    });
    return { unreadCount };
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const recipientId = new Types.ObjectId(userId);
    const result = await this.notificationModel.updateMany(
      { recipientId, readAt: null },
      { $set: { readAt: new Date() } },
    );
    return { updated: result.modifiedCount ?? 0 };
  }

  async markRead(
    userId: string,
    notificationId: string,
  ): Promise<{ updated: boolean }> {
    if (!Types.ObjectId.isValid(notificationId)) {
      return { updated: false };
    }

    const result = await this.notificationModel.updateOne(
      {
        _id: new Types.ObjectId(notificationId),
        recipientId: new Types.ObjectId(userId),
      },
      { $set: { readAt: new Date() } },
    );

    return { updated: Boolean(result.modifiedCount) };
  }

  async markUnread(
    userId: string,
    notificationId: string,
  ): Promise<{ updated: boolean }> {
    if (!Types.ObjectId.isValid(notificationId)) {
      return { updated: false };
    }

    const result = await this.notificationModel.updateOne(
      {
        _id: new Types.ObjectId(notificationId),
        recipientId: new Types.ObjectId(userId),
      },
      { $set: { readAt: null } },
    );

    return { updated: Boolean(result.modifiedCount) };
  }

  async deleteNotification(
    userId: string,
    notificationId: string,
  ): Promise<{ deleted: boolean }> {
    if (!Types.ObjectId.isValid(notificationId)) {
      return { deleted: false };
    }

    const result = await this.notificationModel.deleteOne({
      _id: new Types.ObjectId(notificationId),
      recipientId: new Types.ObjectId(userId),
    });

    return { deleted: Boolean(result.deletedCount) };
  }

  async createPostLikeNotification(params: {
    actorId: string;
    recipientId: string;
    postId: string;
    postKind: PostKind;
  }): Promise<NotificationItem | null> {
    const { actorId, recipientId, postId, postKind } = params;

    if (!(await this.canEmitCategoryNotification(recipientId, 'like'))) {
      return null;
    }

    const doc = await this.notificationModel
      .findOneAndUpdate(
        {
          recipientId: new Types.ObjectId(recipientId),
          postId: new Types.ObjectId(postId),
          type: 'post_like',
        },
        {
          $set: {
            actorId: new Types.ObjectId(actorId),
            readAt: null,
            updatedAt: new Date(),
          },
          $inc: { likeCount: 1 },
          $setOnInsert: {
            recipientId: new Types.ObjectId(recipientId),
            postId: new Types.ObjectId(postId),
            type: 'post_like',
            postKind,
          },
        },
        { new: true, upsert: true },
      )
      .exec();

    const profile = await this.profileModel
      .findOne({ userId: new Types.ObjectId(actorId) })
      .select('userId displayName username avatarUrl')
      .lean();

    const post = await this.postModel
      .findById(postId)
      .select('authorId notificationsMutedUntil notificationsMutedIndefinitely')
      .lean();
    const response = this.toResponse(doc, profile ?? null, {
      recipientId,
      post,
    });

    const { unreadCount } = await this.getUnreadCount(recipientId);
    if (
      (await this.canEmitNotification(recipientId)) &&
      (await this.canEmitPostNotification(recipientId, postId))
    ) {
      this.gateway.emitToUser(recipientId, 'notification:new', {
        notification: response,
        unreadCount,
      } satisfies NotificationRealtimePayload);
    }

    return response;
  }

  async createCommentLikeNotification(params: {
    actorId: string;
    recipientId: string;
    postId: string;
    postKind: PostKind;
    commentId: string;
  }): Promise<NotificationItem | null> {
    const { actorId, recipientId, postId, postKind, commentId } = params;

    if (!(await this.canEmitCategoryNotification(recipientId, 'like'))) {
      return null;
    }

    const doc = await this.notificationModel
      .findOneAndUpdate(
        {
          recipientId: new Types.ObjectId(recipientId),
          commentId: new Types.ObjectId(commentId),
          type: 'comment_like',
        },
        {
          $set: {
            actorId: new Types.ObjectId(actorId),
            readAt: null,
            updatedAt: new Date(),
          },
          $inc: { likeCount: 1 },
          $setOnInsert: {
            recipientId: new Types.ObjectId(recipientId),
            commentId: new Types.ObjectId(commentId),
            postId: new Types.ObjectId(postId),
            type: 'comment_like',
            postKind,
          },
        },
        { new: true, upsert: true },
      )
      .exec();

    const profile = await this.profileModel
      .findOne({ userId: new Types.ObjectId(actorId) })
      .select('userId displayName username avatarUrl')
      .lean();

    const post = await this.postModel
      .findById(postId)
      .select('authorId notificationsMutedUntil notificationsMutedIndefinitely')
      .lean();

    const response = this.toResponse(doc, profile ?? null, {
      recipientId,
      post,
    });
    const { unreadCount } = await this.getUnreadCount(recipientId);
    if (
      (await this.canEmitNotification(recipientId)) &&
      (await this.canEmitPostNotification(recipientId, postId))
    ) {
      this.gateway.emitToUser(recipientId, 'notification:new', {
        notification: response,
        unreadCount,
      } satisfies NotificationRealtimePayload);
    }

    return response;
  }

  async createPostCommentNotification(params: {
    actorId: string;
    recipientId: string;
    postId: string;
    postKind: PostKind;
  }): Promise<NotificationItem | null> {
    const { actorId, recipientId, postId, postKind } = params;

    if (!(await this.canEmitCategoryNotification(recipientId, 'comment'))) {
      return null;
    }

    const doc = await this.notificationModel
      .findOneAndUpdate(
        {
          recipientId: new Types.ObjectId(recipientId),
          postId: new Types.ObjectId(postId),
          type: 'post_comment',
        },
        {
          $set: {
            actorId: new Types.ObjectId(actorId),
            readAt: null,
            updatedAt: new Date(),
          },
          $addToSet: { commentActorIds: new Types.ObjectId(actorId) },
          $setOnInsert: {
            recipientId: new Types.ObjectId(recipientId),
            postId: new Types.ObjectId(postId),
            type: 'post_comment',
            postKind,
            commentCount: 1,
          },
        },
        { new: true, upsert: true },
      )
      .exec();

    const profile = await this.profileModel
      .findOne({ userId: new Types.ObjectId(actorId) })
      .select('userId displayName username avatarUrl')
      .lean();

    const post = await this.postModel
      .findById(postId)
      .select('authorId notificationsMutedUntil notificationsMutedIndefinitely')
      .lean();
    const response = this.toResponse(doc, profile ?? null, {
      recipientId,
      post,
    });
    const { unreadCount } = await this.getUnreadCount(recipientId);
    if (
      (await this.canEmitNotification(recipientId)) &&
      (await this.canEmitPostNotification(recipientId, postId))
    ) {
      this.gateway.emitToUser(recipientId, 'notification:new', {
        notification: response,
        unreadCount,
      } satisfies NotificationRealtimePayload);
    }

    return response;
  }

  async createCommentReplyNotification(params: {
    actorId: string;
    recipientId: string;
    postId: string;
    postKind: PostKind;
    commentId: string;
  }): Promise<NotificationItem | null> {
    const { actorId, recipientId, postId, postKind, commentId } = params;

    if (!(await this.canEmitCategoryNotification(recipientId, 'comment'))) {
      return null;
    }

    const doc = await this.notificationModel
      .findOneAndUpdate(
        {
          recipientId: new Types.ObjectId(recipientId),
          commentId: new Types.ObjectId(commentId),
          type: 'comment_reply',
        },
        {
          $set: {
            actorId: new Types.ObjectId(actorId),
            readAt: null,
            updatedAt: new Date(),
          },
          $inc: { commentCount: 1 },
          $setOnInsert: {
            recipientId: new Types.ObjectId(recipientId),
            commentId: new Types.ObjectId(commentId),
            postId: new Types.ObjectId(postId),
            type: 'comment_reply',
            postKind,
          },
        },
        { new: true, upsert: true },
      )
      .exec();

    const profile = await this.profileModel
      .findOne({ userId: new Types.ObjectId(actorId) })
      .select('userId displayName username avatarUrl')
      .lean();

    const post = await this.postModel
      .findById(postId)
      .select('authorId notificationsMutedUntil notificationsMutedIndefinitely')
      .lean();

    const response = this.toResponse(doc, profile ?? null, {
      recipientId,
      post,
    });
    const { unreadCount } = await this.getUnreadCount(recipientId);
    if (
      (await this.canEmitNotification(recipientId)) &&
      (await this.canEmitPostNotification(recipientId, postId))
    ) {
      this.gateway.emitToUser(recipientId, 'notification:new', {
        notification: response,
        unreadCount,
      } satisfies NotificationRealtimePayload);
    }

    return response;
  }

  async createPostMentionNotification(params: {
    actorId: string;
    recipientId: string;
    postId: string;
    postKind: PostKind;
    source: 'post' | 'comment';
  }): Promise<NotificationItem | null> {
    const { actorId, recipientId, postId, postKind, source } = params;

    if (!(await this.canEmitCategoryNotification(recipientId, 'mentions'))) {
      return null;
    }

    const doc = await this.notificationModel
      .findOneAndUpdate(
        {
          recipientId: new Types.ObjectId(recipientId),
          postId: new Types.ObjectId(postId),
          type: 'post_mention',
        },
        {
          $set: {
            actorId: new Types.ObjectId(actorId),
            readAt: null,
            mentionSource: source,
            updatedAt: new Date(),
          },
          $addToSet: { mentionActorIds: new Types.ObjectId(actorId) },
          $setOnInsert: {
            recipientId: new Types.ObjectId(recipientId),
            postId: new Types.ObjectId(postId),
            type: 'post_mention',
            postKind,
            mentionCount: 1,
          },
        },
        { new: true, upsert: true },
      )
      .exec();

    const profile = await this.profileModel
      .findOne({ userId: new Types.ObjectId(actorId) })
      .select('userId displayName username avatarUrl')
      .lean();

    const post = await this.postModel
      .findById(postId)
      .select('authorId notificationsMutedUntil notificationsMutedIndefinitely')
      .lean();
    const response = this.toResponse(doc, profile ?? null, {
      recipientId,
      post,
    });
    const { unreadCount } = await this.getUnreadCount(recipientId);
    if (
      (await this.canEmitNotification(recipientId)) &&
      (await this.canEmitPostNotification(recipientId, postId))
    ) {
      this.gateway.emitToUser(recipientId, 'notification:new', {
        notification: response,
        unreadCount,
      } satisfies NotificationRealtimePayload);
    }

    return response;
  }

  async createLoginAlertNotification(params: {
    recipientId: string;
    deviceInfo?: string;
    deviceType?: string;
    os?: string;
    browser?: string;
    location?: string;
    ip?: string;
    deviceIdHash?: string;
    loginAt?: Date;
  }): Promise<NotificationItem> {
    const recipientId = new Types.ObjectId(params.recipientId);
    const doc = await this.notificationModel
      .create({
        recipientId,
        actorId: recipientId,
        postId: null,
        postKind: 'post',
        type: 'login_alert',
        deviceInfo: params.deviceInfo ?? '',
        deviceType: params.deviceType ?? '',
        os: params.os ?? '',
        browser: params.browser ?? '',
        location: params.location ?? '',
        ip: params.ip ?? '',
        deviceIdHash: params.deviceIdHash ?? '',
        loginAt: params.loginAt ?? new Date(),
        readAt: null,
      })
      .then((created) => created.toObject() as NotificationDoc);

    const profile = await this.profileModel
      .findOne({ userId: recipientId })
      .select('userId displayName username avatarUrl')
      .lean();

    const response = this.toResponse(doc, profile ?? null, {
      recipientId: params.recipientId,
    });
    const { unreadCount } = await this.getUnreadCount(params.recipientId);
    if (await this.canEmitNotification(params.recipientId)) {
      this.gateway.emitToUser(params.recipientId, 'notification:new', {
        notification: response,
        unreadCount,
      } satisfies NotificationRealtimePayload);
    }

    return response;
  }

  async createFollowNotification(params: {
    actorId: string;
    recipientId: string;
  }): Promise<NotificationItem | null> {
    const { actorId, recipientId } = params;
    if (!(await this.canEmitCategoryNotification(recipientId, 'follow'))) {
      return null;
    }
    const filter = {
      recipientId: new Types.ObjectId(recipientId),
      actorId: new Types.ObjectId(actorId),
      type: 'follow' as const,
      postId: null,
    };

    const existing = await this.notificationModel.findOne(filter).lean();
    if (existing) {
      await this.notificationModel
        .updateOne(filter, { $set: { updatedAt: new Date() } })
        .exec();
      const profile = await this.profileModel
        .findOne({ userId: new Types.ObjectId(actorId) })
        .select('userId displayName username avatarUrl')
        .lean();
      const response = this.toResponse(
        existing as NotificationDoc,
        profile ?? null,
      );
      return response;
    }

    const created = await this.notificationModel.create({
      ...filter,
      readAt: null,
    });

    const profile = await this.profileModel
      .findOne({ userId: new Types.ObjectId(actorId) })
      .select('userId displayName username avatarUrl')
      .lean();

    const response = this.toResponse(created, profile ?? null, {
      recipientId,
    });
    const { unreadCount } = await this.getUnreadCount(recipientId);
    if (await this.canEmitNotification(recipientId)) {
      this.gateway.emitToUser(recipientId, 'notification:new', {
        notification: response,
        unreadCount,
      } satisfies NotificationRealtimePayload);
    }

    return response;
  }

  async createReportResolutionNotification(params: {
    recipientId: string;
    outcome: ReportNotificationOutcome;
    audience: ReportNotificationAudience;
    targetType: ReportNotificationTargetType;
    action: string;
    targetId?: string;
    targetPostId?: string;
    severity?: ReportNotificationSeverity | null;
    strikeDelta?: number | null;
    strikeTotal?: number | null;
    reason?: string | null;
    actionExpiresAt?: Date | null;
  }): Promise<NotificationItem> {
    const recipientObjectId = new Types.ObjectId(params.recipientId);
    const type: NotificationType = 'report';
    const targetPostObjectId =
      params.targetPostId && Types.ObjectId.isValid(params.targetPostId)
        ? new Types.ObjectId(params.targetPostId)
        : null;

    const doc = await this.notificationModel
      .create({
        recipientId: recipientObjectId,
        actorId: recipientObjectId,
        postId: targetPostObjectId,
        commentId: null,
        postKind: 'post',
        type,
        reportOutcome: params.outcome,
        reportAudience: params.audience,
        reportTargetType: params.targetType,
        reportAction: params.action,
        reportTargetId: params.targetId ?? null,
        reportSeverity: params.severity ?? null,
        reportStrikeDelta: params.strikeDelta ?? null,
        reportStrikeTotal: params.strikeTotal ?? null,
        reportReason: params.reason ?? null,
        reportActionExpiresAt: params.actionExpiresAt ?? null,
        readAt: null,
      })
      .then((created) => created.toObject() as NotificationDoc);

    const profile = await this.profileModel
      .findOne({ userId: recipientObjectId })
      .select('userId displayName username avatarUrl')
      .lean();

    const response = this.toResponse(doc, profile ?? null, {
      recipientId: params.recipientId,
    });
    const { unreadCount } = await this.getUnreadCount(params.recipientId);

    this.gateway.emitToUser(params.recipientId, 'notification:new', {
      notification: response,
      unreadCount,
    } satisfies NotificationRealtimePayload);

    return response;
  }

  async createPostModerationResultNotification(params: {
    recipientId: string;
    postId?: string | null;
    postKind?: PostKind;
    decision: 'approve' | 'blur' | 'reject';
    reasons?: string[];
  }): Promise<NotificationItem> {
    const recipientObjectId = new Types.ObjectId(params.recipientId);
    const postObjectId =
      params.postId && Types.ObjectId.isValid(params.postId)
        ? new Types.ObjectId(params.postId)
        : null;

    const doc = await this.notificationModel
      .create({
        recipientId: recipientObjectId,
        actorId: recipientObjectId,
        postId: postObjectId,
        commentId: null,
        postKind: params.postKind ?? 'post',
        type: 'post_moderation',
        moderationDecision: params.decision,
        moderationReasons: (params.reasons ?? []).slice(0, 3),
        readAt: null,
      })
      .then((created) => created.toObject() as NotificationDoc);

    const profile = await this.profileModel
      .findOne({ userId: recipientObjectId })
      .select('userId displayName username avatarUrl')
      .lean();

    const response = this.toResponse(doc, profile ?? null, {
      recipientId: params.recipientId,
    });
    const { unreadCount } = await this.getUnreadCount(params.recipientId);

    if (await this.canEmitNotification(params.recipientId)) {
      this.gateway.emitToUser(params.recipientId, 'notification:new', {
        notification: response,
        unreadCount,
      } satisfies NotificationRealtimePayload);
    }

    return response;
  }

  async createReportDismissedNotification(params: {
    recipientId: string;
  }): Promise<NotificationItem> {
    return this.createReportResolutionNotification({
      recipientId: params.recipientId,
      outcome: 'no_violation',
      audience: 'reporter',
      targetType: 'post',
      action: 'no_violation',
    });
  }

  async removeFollowNotification(params: {
    actorId: string;
    recipientId: string;
  }): Promise<void> {
    // Intentionally keep the follow notification to avoid spam on re-follow.
    return;
  }

  async decrementPostLikeNotification(params: {
    recipientId: string;
    postId: string;
    latestActorId?: string | null;
  }): Promise<void> {
    const { recipientId, postId, latestActorId } = params;
    const update: Record<string, unknown> = {
      $inc: { likeCount: -1 },
    };
    if (latestActorId) {
      update.$set = { actorId: new Types.ObjectId(latestActorId) };
    }

    const doc = await this.notificationModel
      .findOneAndUpdate(
        {
          recipientId: new Types.ObjectId(recipientId),
          postId: new Types.ObjectId(postId),
          type: 'post_like',
        },
        update,
        { new: true },
      )
      .exec();

    if (!doc) return;
    const count = typeof doc.likeCount === 'number' ? doc.likeCount : 0;
    if (count <= 0) {
      await this.notificationModel.deleteOne({ _id: doc._id }).exec();
    }
  }

  async decrementCommentLikeNotification(params: {
    recipientId: string;
    commentId: string;
    latestActorId?: string | null;
  }): Promise<void> {
    const { recipientId, commentId, latestActorId } = params;
    const update: Record<string, unknown> = {
      $inc: { likeCount: -1 },
    };
    if (latestActorId) {
      update.$set = { actorId: new Types.ObjectId(latestActorId) };
    }

    const doc = await this.notificationModel
      .findOneAndUpdate(
        {
          recipientId: new Types.ObjectId(recipientId),
          commentId: new Types.ObjectId(commentId),
          type: 'comment_like',
        },
        update,
        { new: true },
      )
      .exec();

    if (!doc) return;
    const count = typeof doc.likeCount === 'number' ? doc.likeCount : 0;
    if (count <= 0) {
      await this.notificationModel.deleteOne({ _id: doc._id }).exec();
    }
  }

  async decrementPostCommentNotification(params: {
    recipientId: string;
    postId: string;
    actorIds: string[];
    latestActorId?: string | null;
  }): Promise<void> {
    const { recipientId, postId, actorIds, latestActorId } = params;
    if (!actorIds.length) {
      await this.notificationModel
        .deleteOne({
          recipientId: new Types.ObjectId(recipientId),
          postId: new Types.ObjectId(postId),
          type: 'post_comment',
        })
        .exec();
      return;
    }

    const update: Record<string, unknown> = {
      $set: {
        commentActorIds: actorIds.map((id) => new Types.ObjectId(id)),
        commentCount: actorIds.length,
      },
    };
    if (latestActorId) {
      (update.$set as Record<string, unknown>).actorId = new Types.ObjectId(
        latestActorId,
      );
    }

    await this.notificationModel
      .updateOne(
        {
          recipientId: new Types.ObjectId(recipientId),
          postId: new Types.ObjectId(postId),
          type: 'post_comment',
        },
        update,
      )
      .exec();
  }

  private toResponse(
    doc: NotificationDoc,
    profile: Pick<
      Profile,
      'userId' | 'displayName' | 'username' | 'avatarUrl'
    > | null,
    context?: {
      recipientId?: string;
      post?: {
        authorId?: Types.ObjectId | string | null;
        notificationsMutedUntil?: Date | string | null;
        notificationsMutedIndefinitely?: boolean | null;
      } | null;
    },
  ): NotificationItem {
    const actorId = doc.actorId?.toString() ?? '';
    const createdAt =
      doc.createdAt?.toISOString?.() ?? new Date().toISOString();
    const activityAt = doc.updatedAt?.toISOString?.() ?? createdAt;
    const postAuthorId = context?.post?.authorId?.toString?.()
      ? context?.post?.authorId?.toString?.()
      : typeof context?.post?.authorId === 'string'
        ? context?.post?.authorId
        : null;
    const recipientId = context?.recipientId ?? null;
    const isOwnPost = Boolean(postAuthorId && recipientId === postAuthorId);
    const postMutedUntilRaw = context?.post?.notificationsMutedUntil ?? null;
    const postMutedUntil = postMutedUntilRaw
      ? new Date(postMutedUntilRaw).toISOString()
      : null;
    const postMutedIndefinitely =
      context?.post?.notificationsMutedIndefinitely ?? false;

    return {
      id: doc._id.toString(),
      type: doc.type,
      actor: {
        id: profile?.userId?.toString() ?? actorId,
        displayName: profile?.displayName ?? 'Unknown user',
        username: profile?.username ?? '',
        avatarUrl: profile?.avatarUrl ?? DEFAULT_AVATAR_URL,
      },
      postId: doc.postId ? doc.postId.toString() : null,
      commentId: doc.commentId ? doc.commentId.toString() : null,
      postKind: doc.postKind ?? 'post',
      isOwnPost: isOwnPost || undefined,
      postMutedUntil,
      postMutedIndefinitely,
      likeCount: typeof doc.likeCount === 'number' ? doc.likeCount : 1,
      commentCount:
        doc.commentActorIds?.length ??
        (typeof doc.commentCount === 'number' ? doc.commentCount : 0),
      mentionCount:
        doc.mentionActorIds?.length ??
        (typeof doc.mentionCount === 'number' ? doc.mentionCount : 0),
      mentionSource: doc.mentionSource ?? 'post',
      reportOutcome: doc.reportOutcome ?? null,
      reportAudience: doc.reportAudience ?? null,
      reportTargetType: doc.reportTargetType ?? null,
      reportAction: doc.reportAction ?? null,
      reportTargetId: doc.reportTargetId ?? null,
      reportSeverity: doc.reportSeverity ?? null,
      reportStrikeDelta: doc.reportStrikeDelta ?? null,
      reportStrikeTotal: doc.reportStrikeTotal ?? null,
      reportReason: doc.reportReason ?? null,
      reportActionExpiresAt: doc.reportActionExpiresAt
        ? doc.reportActionExpiresAt.toISOString()
        : null,
      moderationDecision: doc.moderationDecision ?? null,
      moderationReasons: Array.isArray(doc.moderationReasons)
        ? doc.moderationReasons
        : [],
      readAt: doc.readAt ? doc.readAt.toISOString() : null,
      createdAt,
      activityAt,
      deviceInfo: doc.deviceInfo ?? '',
      deviceType: doc.deviceType ?? '',
      os: doc.os ?? '',
      browser: doc.browser ?? '',
      location: doc.location ?? '',
      ip: doc.ip ?? '',
      deviceIdHash: doc.deviceIdHash ?? '',
      loginAt: doc.loginAt ? doc.loginAt.toISOString() : null,
    };
  }
}
