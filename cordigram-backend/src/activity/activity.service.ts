import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ActivityLog, ActivityMeta, ActivityType } from './activity.schema';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

@Injectable()
export class ActivityLogService {
  constructor(
    @InjectModel(ActivityLog.name)
    private readonly activityModel: Model<ActivityLog>,
  ) {}

  async log(params: {
    userId: string | Types.ObjectId;
    type: ActivityType;
    postId?: string | Types.ObjectId | null;
    commentId?: string | Types.ObjectId | null;
    targetUserId?: string | Types.ObjectId | null;
    postKind?: 'post' | 'reel' | null;
    meta?: ActivityMeta | null;
  }) {
    if (!params.userId) return null;

    const payload = {
      userId:
        params.userId instanceof Types.ObjectId
          ? params.userId
          : new Types.ObjectId(params.userId),
      type: params.type,
      postId: params.postId
        ? params.postId instanceof Types.ObjectId
          ? params.postId
          : new Types.ObjectId(params.postId)
        : null,
      commentId: params.commentId
        ? params.commentId instanceof Types.ObjectId
          ? params.commentId
          : new Types.ObjectId(params.commentId)
        : null,
      targetUserId: params.targetUserId
        ? params.targetUserId instanceof Types.ObjectId
          ? params.targetUserId
          : new Types.ObjectId(params.targetUserId)
        : null,
      postKind: params.postKind ?? null,
      meta: params.meta ?? null,
    };

    return this.activityModel.create(payload);
  }

  async list(params: {
    userId: string;
    types?: ActivityType[];
    limit?: number;
    cursor?: string | null;
  }) {
    const viewerId = new Types.ObjectId(params.userId);
    const safeLimit = Math.min(
      Math.max(params.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );

    const filter: Record<string, any> = {
      userId: viewerId,
    };

    if (params.types?.length) {
      filter.type = { $in: params.types };
    }

    const cursorData = this.decodeCursor(params.cursor ?? null);
    if (cursorData) {
      filter.$or = [
        { createdAt: { $lt: cursorData.createdAt } },
        {
          createdAt: cursorData.createdAt,
          _id: { $lt: cursorData.id },
        },
      ];
    }

    const docs = await this.activityModel
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(safeLimit + 1)
      .lean();

    const hasNext = docs.length > safeLimit;
    const items = hasNext ? docs.slice(0, safeLimit) : docs;

    const nextCursor = hasNext
      ? this.encodeCursor(items[items.length - 1])
      : null;

    return {
      items: items.map((doc) => ({
        id: doc._id?.toString?.(),
        type: doc.type,
        postId: doc.postId?.toString?.() ?? null,
        commentId: doc.commentId?.toString?.() ?? null,
        targetUserId: doc.targetUserId?.toString?.() ?? null,
        postKind: doc.postKind ?? null,
        meta: doc.meta ?? null,
        createdAt: doc.createdAt?.toISOString?.() ?? null,
      })),
      nextCursor,
    };
  }

  private encodeCursor(doc: { _id?: Types.ObjectId; createdAt?: Date }) {
    const id = doc._id?.toString?.();
    const createdAt = doc.createdAt?.toISOString?.();
    if (!id || !createdAt) return null;
    return `${createdAt}_${id}`;
  }

  private decodeCursor(cursor: string | null) {
    if (!cursor) return null;
    const [createdAtRaw, idRaw] = cursor.split('_');
    if (!createdAtRaw || !idRaw) return null;
    const createdAt = new Date(createdAtRaw);
    if (Number.isNaN(createdAt.getTime())) return null;
    if (!Types.ObjectId.isValid(idRaw)) return null;
    return { createdAt, id: new Types.ObjectId(idRaw) };
  }
}
