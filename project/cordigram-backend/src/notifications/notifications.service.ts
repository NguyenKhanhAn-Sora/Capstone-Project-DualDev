import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationType } from './notification.schema';
import type { PostKind } from '../posts/post.schema';
import { Profile } from '../profiles/profile.schema';
import { NotificationsGateway } from './notifications.gateway';

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
  postKind: PostKind;
  likeCount: number;
  commentCount: number;
  readAt: string | null;
  createdAt: string;
};

export type NotificationRealtimePayload = {
  notification: NotificationItem;
  unreadCount: number;
};

type NotificationDoc = {
  _id: Types.ObjectId;
  type: NotificationType;
  actorId?: Types.ObjectId | null;
  postId?: Types.ObjectId | null;
  postKind?: PostKind;
  likeCount?: number;
  commentCount?: number;
  commentActorIds?: Types.ObjectId[];
  readAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,
    @InjectModel(Profile.name)
    private readonly profileModel: Model<Profile>,
    private readonly gateway: NotificationsGateway,
  ) {}

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
      return this.toResponse(doc, profile);
    });

    return { items };
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

  async createPostLikeNotification(params: {
    actorId: string;
    recipientId: string;
    postId: string;
    postKind: PostKind;
  }): Promise<NotificationItem> {
    const { actorId, recipientId, postId, postKind } = params;

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

    const response = this.toResponse(doc, profile ?? null);

    const { unreadCount } = await this.getUnreadCount(recipientId);
    this.gateway.emitToUser(recipientId, 'notification:new', {
      notification: response,
      unreadCount,
    } satisfies NotificationRealtimePayload);

    return response;
  }

  async createPostCommentNotification(params: {
    actorId: string;
    recipientId: string;
    postId: string;
    postKind: PostKind;
  }): Promise<NotificationItem> {
    const { actorId, recipientId, postId, postKind } = params;

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

    const response = this.toResponse(doc, profile ?? null);
    const { unreadCount } = await this.getUnreadCount(recipientId);
    this.gateway.emitToUser(recipientId, 'notification:new', {
      notification: response,
      unreadCount,
    } satisfies NotificationRealtimePayload);

    return response;
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
  ): NotificationItem {
    const actorId = doc.actorId?.toString() ?? '';
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
      postKind: doc.postKind ?? 'post',
      likeCount: typeof doc.likeCount === 'number' ? doc.likeCount : 1,
      commentCount:
        doc.commentActorIds?.length ??
        (typeof doc.commentCount === 'number' ? doc.commentCount : 0),
      readAt: doc.readAt ? doc.readAt.toISOString() : null,
      createdAt:
        doc.updatedAt?.toISOString?.() ??
        doc.createdAt?.toISOString?.() ??
        new Date().toISOString(),
    };
  }
}
