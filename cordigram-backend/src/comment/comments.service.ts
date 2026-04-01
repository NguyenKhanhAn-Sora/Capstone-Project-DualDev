import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Comment } from './comment.schema';
import { CommentLike } from './comment-like.schema';
import { Post } from 'src/posts/post.schema';
import { Follow } from '../users/follow.schema';
import { CreateCommentDto } from '../comment/dto/create-comment.dto';
import { BlocksService } from '../users/blocks.service';
import { Profile } from '../profiles/profile.schema';
import { DeleteCommentDto } from './dto/delete-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { ConfigService } from '../config/config.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityLogService } from '../activity/activity.service';
import { User } from '../users/user.schema';
import { LinkPreviewService } from './link-preview.service';

type UploadedFile = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
};

@Injectable()
export class CommentsService {
  constructor(
    @InjectModel(Comment.name)
    private readonly commentModel: Model<Comment>,
    @InjectModel(CommentLike.name)
    private readonly commentLikeModel: Model<CommentLike>,
    @InjectModel(Post.name)
    private readonly postModel: Model<Post>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(Profile.name)
    private readonly profileModel: Model<Profile>,
    @InjectModel(Follow.name)
    private readonly followModel: Model<Follow>,
    private readonly blocksService: BlocksService,
    private readonly cloudinary: CloudinaryService,
    private readonly config: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly activityLogService: ActivityLogService,
    private readonly linkPreviewService: LinkPreviewService,
  ) {}

  private async getCreatorVerifiedMap(userIds: Types.ObjectId[]) {
    if (!userIds.length) return new Map<string, boolean>();
    const users = await this.userModel
      .find({ _id: { $in: userIds } })
      .select('_id isCreatorVerified')
      .lean()
      .exec();
    const entries: Array<[string, boolean]> = [];
    users.forEach((user: any) => {
      const id = user._id?.toString?.();
      if (!id) return;
      entries.push([id, Boolean(user.isCreatorVerified)]);
    });
    return new Map<string, boolean>(entries);
  }

  async create(userId: string, postId: string, dto: CreateCommentDto) {
    const userObjectId = this.asObjectId(userId, 'userId');
    const postObjectId = this.asObjectId(postId, 'postId');

    await this.assertInteractionNotMuted(userObjectId);

    const post = await this.postModel
      .findOne({
        _id: postObjectId,
        deletedAt: null,
        moderationState: 'normal',
      })
      .select('authorId allowComments status kind content media')
      .lean();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    await this.blocksService.assertNotBlocked(userObjectId, post.authorId);

    if (post.allowComments === false) {
      throw new ForbiddenException();
    }

    const content = dto.content?.trim?.() ?? '';
    const media = dto.media ?? null;
    if (!content && !media) {
      throw new BadRequestException('Comment content or media is required');
    }

    let parentId: Types.ObjectId | null = null;
    let rootCommentId: Types.ObjectId | null = null;
    let parentAuthorId: string | null = null;

    if (dto.parentId) {
      if (!Types.ObjectId.isValid(dto.parentId)) {
        throw new BadRequestException('Invalid parentId');
      }
      parentId = new Types.ObjectId(dto.parentId);
      const parent = await this.commentModel
        .findOne({
          _id: parentId,
          postId: postObjectId,
          deletedAt: null,
          moderationState: { $in: ['normal', null] },
        })
        .select('_id rootCommentId authorId')
        .lean();

      if (!parent) {
        throw new NotFoundException('Parent comment not found');
      }

      rootCommentId = parent.rootCommentId ?? parent._id;
      parentAuthorId = parent.authorId?.toString?.() ?? null;
    }

    const mentions = this.normalizeMentions(dto.mentions, content);
    const linkPreviews = await this.linkPreviewService.extractFromText(content);

    const created = await this.commentModel.create({
      postId: postObjectId,
      authorId: userObjectId,
      content,
      mentions,
      media,
      linkPreviews,
      parentId,
      rootCommentId,
      deletedAt: null,
    });

    await this.postModel
      .updateOne({ _id: postObjectId }, { $inc: { 'stats.comments': 1 } })
      .exec();

    await this.notifyMentionedUsers({
      actorId: userObjectId.toString(),
      postId: postObjectId.toString(),
      postKind: post.kind ?? 'post',
      mentions,
    });

    if (
      parentAuthorId &&
      parentId &&
      parentAuthorId !== userObjectId.toString()
    ) {
      await this.notificationsService.createCommentReplyNotification({
        actorId: userObjectId.toString(),
        recipientId: parentAuthorId,
        postId: postObjectId.toString(),
        postKind: post.kind ?? 'post',
        commentId: parentId.toString(),
      });
    }

    if (post.authorId && !post.authorId.equals(userObjectId)) {
      const shouldSkipPostComment =
        Boolean(dto.parentId) &&
        Boolean(parentAuthorId) &&
        post.authorId.toString() === parentAuthorId;

      if (shouldSkipPostComment) {
        // Replying to post author's comment on their own post should only notify reply.
      } else {
        await this.notificationsService.createPostCommentNotification({
          actorId: userObjectId.toString(),
          recipientId: post.authorId.toString(),
          postId: postObjectId.toString(),
          postKind: post.kind ?? 'post',
        });
      }
    }

    const profile = await this.profileModel
      .findOne({ userId: userObjectId })
      .select('userId displayName username avatarUrl')
      .lean();

    const postAuthorProfile = post.authorId
      ? await this.profileModel
          .findOne({ userId: post.authorId })
          .select('displayName username avatarUrl')
          .lean()
      : null;

    await this.activityLogService.log({
      userId: userObjectId,
      type: 'comment',
      postId: postObjectId,
      commentId: created._id,
      postKind: post.kind ?? 'post',
      meta: {
        commentSnippet: content || null,
        postCaption: post.content ?? null,
        postMediaUrl: post.media?.[0]?.url ?? null,
        postAuthorId: post.authorId?.toString?.() ?? null,
        postAuthorDisplayName: postAuthorProfile?.displayName ?? null,
        postAuthorUsername: postAuthorProfile?.username ?? null,
        postAuthorAvatarUrl: postAuthorProfile?.avatarUrl ?? null,
      },
    });

    const creatorVerifiedMap = await this.getCreatorVerifiedMap([userObjectId]);

    return this.toResponse(created, profile || null, {
      repliesCount: 0,
      likesCount: 0,
      liked: false,
      authorIsCreatorVerified:
        creatorVerifiedMap.get(userObjectId.toString()) ?? false,
    });
  }

  private async collectCommentSubtreeIds(params: {
    postObjectId: Types.ObjectId;
    rootCommentId: Types.ObjectId;
  }): Promise<Types.ObjectId[]> {
    const { postObjectId, rootCommentId } = params;
    const idsToDelete: Types.ObjectId[] = [rootCommentId];
    const visited = new Set<string>([rootCommentId.toString()]);

    let frontier = [rootCommentId];
    while (frontier.length) {
      const children = await this.commentModel
        .find({
          postId: postObjectId,
          deletedAt: null,
          parentId: { $in: frontier },
        })
        .select('_id')
        .lean();

      const nextFrontier: Types.ObjectId[] = [];
      for (const child of children) {
        const cid = (child as { _id?: Types.ObjectId })._id;
        if (!cid) continue;
        const key = cid.toString();
        if (visited.has(key)) continue;
        visited.add(key);
        idsToDelete.push(cid);
        nextFrontier.push(cid);
      }
      frontier = nextFrontier;
    }

    return idsToDelete;
  }

  private async softDeleteCommentSubtree(params: {
    postObjectId: Types.ObjectId;
    rootCommentId: Types.ObjectId;
    postAuthorId?: Types.ObjectId | null;
    deletedBy?: Types.ObjectId | null;
    deletedSource?: 'user' | 'admin' | 'system' | null;
    deletedReason?: string | null;
    moderationState?: 'removed' | null;
  }): Promise<{ deleted: true; count: number }> {
    const {
      postObjectId,
      rootCommentId,
      postAuthorId,
      deletedBy,
      deletedSource,
      deletedReason,
      moderationState,
    } = params;

    const idsToDelete = await this.collectCommentSubtreeIds({
      postObjectId,
      rootCommentId,
    });

    const now = new Date();
    const $set: Record<string, unknown> = { deletedAt: now };
    if (deletedBy) $set.deletedBy = deletedBy;
    if (deletedSource) $set.deletedSource = deletedSource;
    if (deletedReason) $set.deletedReason = deletedReason;
    if (moderationState) $set.moderationState = moderationState;

    const deleteResult = await this.commentModel
      .updateMany({ _id: { $in: idsToDelete }, deletedAt: null }, { $set })
      .exec();

    const deletedCount = deleteResult.modifiedCount ?? 0;

    if (deletedCount > 0) {
      await this.postModel
        .updateOne(
          { _id: postObjectId },
          { $inc: { 'stats.comments': -deletedCount } },
        )
        .exec();

      await this.commentLikeModel
        .deleteMany({ commentId: { $in: idsToDelete } })
        .exec();

      const [latest, distinctAuthors] = await Promise.all([
        this.commentModel
          .findOne({ postId: postObjectId, deletedAt: null })
          .sort({ createdAt: -1 })
          .select('authorId')
          .lean(),
        this.commentModel.distinct('authorId', {
          postId: postObjectId,
          deletedAt: null,
        }),
      ]);

      if (postAuthorId) {
        await this.notificationsService.decrementPostCommentNotification({
          recipientId: postAuthorId.toString(),
          postId: postObjectId.toString(),
          actorIds: (distinctAuthors ?? []).map((id) => id.toString()),
          latestActorId: latest?.authorId?.toString() ?? null,
        });
      }
    }

    return { deleted: true, count: deletedCount };
  }

  private async assertInteractionNotMuted(
    userObjectId: Types.ObjectId,
  ): Promise<void> {
    const user = await this.userModel
      .findById(userObjectId)
      .select('interactionMutedUntil interactionMutedIndefinitely')
      .lean()
      .exec();

    if (user?.interactionMutedIndefinitely) {
      throw new ForbiddenException(
        'Interaction is muted until a moderator turns it back on',
      );
    }

    const mutedUntil = user?.interactionMutedUntil ?? null;
    if (!mutedUntil) return;

    const mutedDate = new Date(mutedUntil);
    if (
      Number.isNaN(mutedDate.getTime()) ||
      mutedDate.getTime() <= Date.now()
    ) {
      await this.userModel
        .updateOne(
          { _id: userObjectId },
          {
            $set: {
              interactionMutedUntil: null,
              interactionMutedIndefinitely: false,
            },
          },
        )
        .exec();
      return;
    }

    const readableMutedUntil = new Intl.DateTimeFormat('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(mutedDate);

    throw new ForbiddenException(
      `Interaction is muted until ${readableMutedUntil}`,
    );
  }

  async list(
    userId: string,
    postId: string,
    options?: { page?: number; limit?: number; parentId?: string },
  ) {
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    const userObjectId = this.asObjectId(userId, 'userId');
    const postObjectId = this.asObjectId(postId, 'postId');

    const post = await this.postModel
      .findOne({
        _id: postObjectId,
        deletedAt: null,
        moderationState: 'normal',
      })
      .select('authorId allowComments status')
      .lean();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    await this.blocksService.assertNotBlocked(userObjectId, post.authorId);

    const { blockedIds, blockedByIds } =
      await this.blocksService.getBlockLists(userObjectId);
    const excludedAuthorIds = Array.from(
      new Set<string>([...blockedIds, ...blockedByIds]),
    )
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const rawPage = Number(options?.page);
    const page =
      Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;

    const rawLimit = Number(options?.limit);
    const limitCandidate =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 20;
    const limit = Math.min(Math.max(limitCandidate, 1), 50);
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {
      postId: postObjectId,
      deletedAt: null,
      moderationState: { $in: ['normal', null] },
    };

    if (excludedAuthorIds.length) {
      query.authorId = { $nin: excludedAuthorIds };
    }

    if (options?.parentId) {
      const parentObjectId = this.asObjectId(options.parentId, 'parentId');
      query.parentId = parentObjectId;
    } else {
      query.parentId = null;
    }

    const sortOrder: Record<string, 1 | -1> = options?.parentId
      ? { createdAt: 1, _id: 1 }
      : { pinnedAt: -1, createdAt: 1, _id: 1 };

    const comments = await this.commentModel
      .find(query)
      .sort(sortOrder)
      .skip(skip)
      .limit(limit + 1)
      .lean();

    const hasMore = comments.length > limit;
    const items = comments.slice(0, limit);

    const replyCountMap = new Map<string, number>();
    const likesCountMap = new Map<string, number>();
    const likedSet = new Set<string>();

    if (items.length) {
      const parentIds = items
        .map((item) => (item as { _id?: Types.ObjectId })._id)
        .filter((id): id is Types.ObjectId => Boolean(id));

      if (parentIds.length) {
        const replyCounts = await this.commentModel
          .aggregate<{
            _id: Types.ObjectId;
            count: number;
          }>([
            {
              $match: {
                parentId: { $in: parentIds },
                deletedAt: null,
                moderationState: { $in: ['normal', null] },
                ...(excludedAuthorIds.length
                  ? { authorId: { $nin: excludedAuthorIds } }
                  : {}),
              },
            },
            { $group: { _id: '$parentId', count: { $sum: 1 } } },
          ])
          .exec();

        replyCounts.forEach((row) => {
          replyCountMap.set(row._id.toString(), row.count);
        });

        const likes = await this.commentLikeModel
          .aggregate<{
            _id: Types.ObjectId;
            count: number;
          }>([
            { $match: { commentId: { $in: parentIds } } },
            { $group: { _id: '$commentId', count: { $sum: 1 } } },
          ])
          .exec();

        likes.forEach((row) => {
          likesCountMap.set(row._id.toString(), row.count);
        });

        const likedDocs = await this.commentLikeModel
          .find({ commentId: { $in: parentIds }, userId: userObjectId })
          .select('commentId')
          .lean()
          .exec();

        likedDocs.forEach((doc) => {
          const id = doc.commentId?.toString?.();
          if (id) likedSet.add(id);
        });
      }
    }

    const authorIds = Array.from(
      new Set(
        items
          .map((c) => c.authorId?.toString?.())
          .filter((id): id is string => Boolean(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const profiles = await this.profileModel
      .find({ userId: { $in: authorIds } })
      .select('userId displayName username avatarUrl')
      .lean();

    const creatorVerifiedMap = await this.getCreatorVerifiedMap(authorIds);

    const profileMap = new Map(profiles.map((p) => [p.userId.toString(), p]));

    return {
      page,
      limit,
      hasMore,
      items: items.map((item) => {
        const profile = profileMap.get(item.authorId?.toString?.() ?? '');
        const id = (item as { _id?: Types.ObjectId })._id?.toString?.() ?? '';
        const repliesCount = replyCountMap.get(id) ?? 0;
        const likesCount = likesCountMap.get(id) ?? 0;
        const liked = likedSet.has(id);

        return this.toResponse(item, profile || null, {
          repliesCount,
          likesCount,
          liked,
          authorIsCreatorVerified:
            creatorVerifiedMap.get(item.authorId?.toString?.() ?? '') ?? false,
        });
      }),
    };
  }

  async deleteComment(
    userId: string,
    postId: string,
    commentId: string,
    _dto?: DeleteCommentDto,
  ) {
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const userObjectId = this.asObjectId(userId, 'userId');
    const postObjectId = this.asObjectId(postId, 'postId');
    const commentObjectId = this.asObjectId(commentId, 'commentId');

    const post = await this.postModel
      .findOne({
        _id: postObjectId,
        deletedAt: null,
        moderationState: 'normal',
      })
      .select('authorId')
      .lean();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const comment = await this.commentModel
      .findOne({
        _id: commentObjectId,
        postId: postObjectId,
        deletedAt: null,
        moderationState: { $in: ['normal', null] },
      })
      .select('_id authorId')
      .lean();

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    const isPostOwner = Boolean(
      post.authorId && post.authorId.equals(userObjectId),
    );
    const isCommentOwner = Boolean(
      comment.authorId && comment.authorId.equals(userObjectId),
    );

    if (!isPostOwner && !isCommentOwner) {
      throw new ForbiddenException('Not allowed to delete this comment');
    }

    return this.softDeleteCommentSubtree({
      postObjectId,
      rootCommentId: commentObjectId,
      postAuthorId: post.authorId ?? null,
      deletedBy: userObjectId,
      deletedSource: 'user',
      moderationState: null,
    });
  }

  async adminDeleteCommentForModeration(params: {
    postId: string;
    commentId: string;
    moderatorId: string;
    reason?: string | null;
  }): Promise<{ deleted: true; count: number }> {
    const postObjectId = this.asObjectId(params.postId, 'postId');
    const commentObjectId = this.asObjectId(params.commentId, 'commentId');
    const moderatorObjectId = this.asObjectId(
      params.moderatorId,
      'moderatorId',
    );

    const post = await this.postModel
      .findById(postObjectId)
      .select('authorId')
      .lean();
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const comment = await this.commentModel
      .findOne({
        _id: commentObjectId,
        postId: postObjectId,
        deletedAt: null,
      })
      .select('_id')
      .lean();

    if (!comment?._id) {
      throw new NotFoundException('Comment not found');
    }

    return this.softDeleteCommentSubtree({
      postObjectId,
      rootCommentId: commentObjectId,
      postAuthorId: post.authorId ?? null,
      deletedBy: moderatorObjectId,
      deletedSource: 'admin',
      deletedReason: params.reason ?? null,
      moderationState: 'removed',
    });
  }

  async likeComment(userId: string, postId: string, commentId: string) {
    const userObjectId = this.asObjectId(userId, 'userId');
    const postObjectId = this.asObjectId(postId, 'postId');
    const commentObjectId = this.asObjectId(commentId, 'commentId');

    await this.assertInteractionNotMuted(userObjectId);

    const comment = await this.commentModel
      .findOne({
        _id: commentObjectId,
        postId: postObjectId,
        deletedAt: null,
        moderationState: { $in: ['normal', null] },
      })
      .select('authorId content')
      .lean();

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    await this.blocksService.assertNotBlocked(userObjectId, comment.authorId);

    const result = await this.commentLikeModel
      .updateOne(
        { commentId: commentObjectId, userId: userObjectId },
        {
          $setOnInsert: {
            commentId: commentObjectId,
            userId: userObjectId,
            createdAt: new Date(),
          },
        },
        { upsert: true },
      )
      .exec();

    const created = Boolean(
      (result as { upsertedCount?: number }).upsertedCount,
    );
    const likesCount = await this.commentLikeModel.countDocuments({
      commentId: commentObjectId,
    });

    if (created) {
      const post = await this.postModel
        .findOne({
          _id: postObjectId,
          deletedAt: null,
          moderationState: 'normal',
        })
        .select('authorId kind content media')
        .lean();

      const postAuthorProfile = post?.authorId
        ? await this.profileModel
            .findOne({ userId: post.authorId })
            .select('displayName username avatarUrl')
            .lean()
        : null;

      await this.activityLogService.log({
        userId: userObjectId,
        type: 'comment_like',
        postId: postObjectId,
        commentId: commentObjectId,
        postKind: post?.kind ?? 'post',
        meta: {
          commentSnippet: comment?.content ?? null,
          postCaption: post?.content ?? null,
          postMediaUrl: post?.media?.[0]?.url ?? null,
          postAuthorId: post?.authorId?.toString?.() ?? null,
          postAuthorDisplayName: postAuthorProfile?.displayName ?? null,
          postAuthorUsername: postAuthorProfile?.username ?? null,
          postAuthorAvatarUrl: postAuthorProfile?.avatarUrl ?? null,
        },
      });

      if (comment.authorId && !comment.authorId.equals(userObjectId)) {
        await this.notificationsService.createCommentLikeNotification({
          actorId: userObjectId.toString(),
          recipientId: comment.authorId.toString(),
          postId: postObjectId.toString(),
          postKind: post?.kind ?? 'post',
          commentId: commentObjectId.toString(),
        });
      }
    }

    return { liked: true, created, likesCount };
  }

  async unlikeComment(userId: string, postId: string, commentId: string) {
    const userObjectId = this.asObjectId(userId, 'userId');
    const postObjectId = this.asObjectId(postId, 'postId');
    const commentObjectId = this.asObjectId(commentId, 'commentId');

    const comment = await this.commentModel
      .findOne({
        _id: commentObjectId,
        postId: postObjectId,
        deletedAt: null,
        moderationState: { $in: ['normal', null] },
      })
      .select('authorId')
      .lean();

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    await this.blocksService.assertNotBlocked(userObjectId, comment.authorId);

    const removed = await this.commentLikeModel
      .deleteOne({ commentId: commentObjectId, userId: userObjectId })
      .exec();

    if (removed?.deletedCount && comment.authorId) {
      if (!comment.authorId.equals(userObjectId)) {
        const latest = await this.commentLikeModel
          .findOne({ commentId: commentObjectId })
          .sort({ createdAt: -1 })
          .select('userId')
          .lean();

        await this.notificationsService.decrementCommentLikeNotification({
          recipientId: comment.authorId.toString(),
          commentId: commentObjectId.toString(),
          latestActorId: latest?.userId?.toString() ?? null,
        });
      }
    }

    const likesCount = await this.commentLikeModel.countDocuments({
      commentId: commentObjectId,
    });
    return { liked: false, likesCount };
  }

  async listCommentLikes(params: {
    viewerId: string;
    postId: string;
    commentId: string;
    limit?: number;
    cursor?: string;
  }): Promise<{
    items: Array<{
      userId: string;
      username: string;
      displayName: string;
      avatarUrl: string;
      isFollowing: boolean;
    }>;
    nextCursor: string | null;
  }> {
    const userObjectId = this.asObjectId(params.viewerId, 'viewerId');
    const postObjectId = this.asObjectId(params.postId, 'postId');
    const commentObjectId = this.asObjectId(params.commentId, 'commentId');

    const post = await this.postModel
      .findOne({
        _id: postObjectId,
        deletedAt: null,
        moderationState: 'normal',
      })
      .select('authorId')
      .lean();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.authorId) {
      await this.blocksService.assertNotBlocked(userObjectId, post.authorId);
    }

    const comment = await this.commentModel
      .findOne({
        _id: commentObjectId,
        postId: postObjectId,
        deletedAt: null,
      })
      .select('authorId')
      .lean();

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.authorId) {
      await this.blocksService.assertNotBlocked(userObjectId, comment.authorId);
    }

    const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 50);
    const cursor = params.cursor
      ? this.asObjectId(params.cursor, 'cursor')
      : null;

    const { blockedIds, blockedByIds } =
      await this.blocksService.getBlockLists(userObjectId);
    const excluded = [...blockedIds, ...blockedByIds]
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const likes = await this.commentLikeModel
      .find({
        commentId: commentObjectId,
        ...(cursor ? { _id: { $lt: cursor } } : {}),
        ...(excluded.length ? { userId: { $nin: excluded } } : {}),
      })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .select('_id userId')
      .lean()
      .exec();

    const slice = likes.slice(0, limit);
    const nextCursor =
      likes.length > limit ? (likes[limit]._id?.toString?.() ?? null) : null;

    const userIds = slice
      .map((doc) => doc.userId?.toString?.())
      .filter(Boolean);

    if (!userIds.length) {
      return { items: [], nextCursor };
    }

    const [profiles, viewerFollowing] = await Promise.all([
      this.profileModel
        .find({ userId: { $in: userIds.map((id) => new Types.ObjectId(id)) } })
        .select('userId username displayName avatarUrl')
        .lean()
        .exec(),
      this.followModel
        .find({
          followerId: userObjectId,
          followeeId: { $in: userIds.map((id) => new Types.ObjectId(id)) },
        })
        .select('followeeId')
        .lean()
        .exec(),
    ]);

    const profileByUserId = new Map<string, any>();
    profiles.forEach((p: any) => {
      const id = p.userId?.toString?.();
      if (id) profileByUserId.set(id, p);
    });

    const followingSet = new Set<string>();
    viewerFollowing.forEach((doc: any) => {
      const id = doc.followeeId?.toString?.();
      if (id) followingSet.add(id);
    });

    const items = userIds
      .map((id) => {
        const p = profileByUserId.get(id);
        if (!p) return null;
        return {
          userId: id,
          username: p.username ?? '',
          displayName: p.displayName ?? p.username ?? '',
          avatarUrl: p.avatarUrl ?? '',
          isFollowing: followingSet.has(id),
        };
      })
      .filter(Boolean) as Array<{
      userId: string;
      username: string;
      displayName: string;
      avatarUrl: string;
      isFollowing: boolean;
    }>;

    return { items, nextCursor };
  }

  async updateComment(
    userId: string,
    postId: string,
    commentId: string,
    dto: UpdateCommentDto,
  ) {
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const userObjectId = this.asObjectId(userId, 'userId');
    const postObjectId = this.asObjectId(postId, 'postId');
    const commentObjectId = this.asObjectId(commentId, 'commentId');

    const comment = await this.commentModel
      .findOne({
        _id: commentObjectId,
        postId: postObjectId,
        deletedAt: null,
        moderationState: { $in: ['normal', null] },
      })
      .select(
        '_id authorId content media createdAt updatedAt parentId rootCommentId mentions',
      )
      .lean();

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    if (!comment.authorId || !comment.authorId.equals(userObjectId)) {
      throw new ForbiddenException('Not allowed to edit this comment');
    }

    const post = await this.postModel
      .findOne({
        _id: postObjectId,
        deletedAt: null,
        moderationState: 'normal',
      })
      .select('kind')
      .lean();

    const hasIncomingContent = typeof dto.content === 'string';
    const nextContent = hasIncomingContent
      ? (dto.content ?? '').trim()
      : (comment.content ?? '');
    const nextMedia =
      dto.media === undefined ? ((comment as any).media ?? null) : dto.media;

    if (!nextContent && !nextMedia) {
      throw new BadRequestException('Comment content or media is required');
    }

    const prevMentions = Array.isArray(comment.mentions)
      ? comment.mentions
      : [];
    const prevMentionNames = prevMentions
      .map((m) => (typeof m === 'string' ? m : m?.username))
      .filter((m): m is string => Boolean(m));
    const mentions = this.normalizeMentions(
      dto.mentions ?? comment.mentions ?? [],
      nextContent,
    );
    const linkPreviews =
      await this.linkPreviewService.extractFromText(nextContent);
    const nextMentionNames = mentions.map((m) => m.username);
    const addedMentions = nextMentionNames.filter(
      (m) => !prevMentionNames.includes(m),
    );

    await this.commentModel
      .updateOne(
        { _id: commentObjectId },
        {
          $set: {
            content: nextContent,
            mentions,
            media: nextMedia,
            linkPreviews,
            updatedAt: new Date(),
          },
        },
      )
      .exec();

    if (addedMentions.length) {
      await this.notifyMentionedUsers({
        actorId: userObjectId.toString(),
        postId: postObjectId.toString(),
        postKind: (post as { kind?: 'post' | 'reel' } | null)?.kind ?? 'post',
        mentions: mentions.filter((m) => addedMentions.includes(m.username)),
      });
    }

    const profile = await this.profileModel
      .findOne({ userId: userObjectId })
      .select('userId displayName username avatarUrl')
      .lean();

    const creatorVerifiedMap = await this.getCreatorVerifiedMap([userObjectId]);

    return this.toResponse(
      {
        ...comment,
        content: nextContent,
        mentions,
        media: nextMedia,
        linkPreviews,
        updatedAt: new Date(),
      },
      profile || null,
      {
        repliesCount: 0,
        likesCount: 0,
        liked: false,
        authorIsCreatorVerified:
          creatorVerifiedMap.get(userObjectId.toString()) ?? false,
      },
    );
  }

  async pinComment(userId: string, postId: string, commentId: string) {
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const userObjectId = this.asObjectId(userId, 'userId');
    const postObjectId = this.asObjectId(postId, 'postId');
    const commentObjectId = this.asObjectId(commentId, 'commentId');

    const post = await this.postModel
      .findOne({
        _id: postObjectId,
        deletedAt: null,
        moderationState: 'normal',
      })
      .select('authorId')
      .lean();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (!post.authorId || !post.authorId.equals(userObjectId)) {
      throw new ForbiddenException('Not allowed to pin comments');
    }

    const comment = await this.commentModel
      .findOne({
        _id: commentObjectId,
        postId: postObjectId,
        deletedAt: null,
        moderationState: { $in: ['normal', null] },
      })
      .select('_id parentId')
      .lean();

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.parentId) {
      throw new BadRequestException('Only root comments can be pinned');
    }

    const now = new Date();

    await this.commentModel
      .updateMany(
        { postId: postObjectId, deletedAt: null, pinnedAt: { $ne: null } },
        { $set: { pinnedAt: null, pinnedBy: null } },
      )
      .exec();

    await this.commentModel
      .updateOne(
        { _id: commentObjectId },
        { $set: { pinnedAt: now, pinnedBy: userObjectId } },
      )
      .exec();

    return { pinned: true };
  }

  async unpinComment(userId: string, postId: string, commentId: string) {
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const userObjectId = this.asObjectId(userId, 'userId');
    const postObjectId = this.asObjectId(postId, 'postId');
    const commentObjectId = this.asObjectId(commentId, 'commentId');

    const post = await this.postModel
      .findOne({
        _id: postObjectId,
        deletedAt: null,
        moderationState: 'normal',
      })
      .select('authorId')
      .lean();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (!post.authorId || !post.authorId.equals(userObjectId)) {
      throw new ForbiddenException('Not allowed to unpin comments');
    }

    await this.commentModel
      .updateOne(
        { _id: commentObjectId, postId: postObjectId },
        { $set: { pinnedAt: null, pinnedBy: null } },
      )
      .exec();

    return { pinned: false };
  }

  private toResponse(
    comment: Comment | Record<string, any>,
    profile: Profile | Record<string, any> | null,
    extras?: {
      repliesCount?: number;
      likesCount?: number;
      liked?: boolean;
      authorIsCreatorVerified?: boolean;
    },
  ) {
    return {
      id:
        (comment as Comment).id ??
        (comment as { _id?: Types.ObjectId })._id?.toString?.(),
      postId: comment.postId?.toString?.(),
      authorId: comment.authorId?.toString?.(),
      author: profile
        ? {
            id: profile.userId?.toString?.(),
            displayName: profile.displayName,
            username: profile.username,
            avatarUrl: profile.avatarUrl,
            isCreatorVerified: extras?.authorIsCreatorVerified ?? false,
          }
        : undefined,
      authorIsCreatorVerified: extras?.authorIsCreatorVerified ?? false,
      content: comment.content,
      mentions: Array.isArray(comment.mentions)
        ? comment.mentions.map((m) => {
            if (typeof m === 'string') {
              return { username: m };
            }
            return {
              userId: m?.userId?.toString?.(),
              username: m?.username,
            };
          })
        : [],
      media: comment.media
        ? {
            type: (comment as any).media?.type,
            url: (comment as any).media?.url,
            metadata: (comment as any).media?.metadata ?? null,
          }
        : null,
      linkPreviews: Array.isArray((comment as any).linkPreviews)
        ? (comment as any).linkPreviews.map((item: any) => ({
            url: item?.url ?? null,
            canonicalUrl: item?.canonicalUrl ?? null,
            domain: item?.domain ?? null,
            siteName: item?.siteName ?? null,
            title: item?.title ?? null,
            description: item?.description ?? null,
            image: item?.image ?? null,
            favicon: item?.favicon ?? null,
          }))
        : [],
      parentId: comment.parentId?.toString?.() ?? null,
      rootCommentId: comment.rootCommentId?.toString?.() ?? null,
      pinnedAt: comment.pinnedAt ?? null,
      pinnedBy: comment.pinnedBy?.toString?.() ?? null,
      createdAt: (comment as { createdAt?: Date }).createdAt,
      updatedAt: (comment as { updatedAt?: Date }).updatedAt,
      repliesCount: extras?.repliesCount ?? 0,
      likesCount: extras?.likesCount ?? 0,
      liked: extras?.liked ?? false,
    };
  }

  async uploadMedia(userId: string, postId: string, file: UploadedFile) {
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    if (!file) {
      throw new BadRequestException('Missing file');
    }

    const userObjectId = this.asObjectId(userId, 'userId');
    const postObjectId = this.asObjectId(postId, 'postId');

    const post = await this.postModel
      .findOne({
        _id: postObjectId,
        deletedAt: null,
        moderationState: 'normal',
      })
      .select('allowComments')
      .lean();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.allowComments === false) {
      throw new ForbiddenException('Comments are disabled');
    }

    return this.uploadSingle(userObjectId.toString(), file);
  }

  private buildUploadFolder(authorId: string): string {
    const now = new Date();
    const parts = [
      this.config.cloudinaryFolder,
      'comments',
      authorId,
      now.getFullYear().toString(),
      `${now.getMonth() + 1}`.padStart(2, '0'),
    ].filter(Boolean);

    return parts.join('/');
  }

  private async uploadSingle(authorId: string, file: UploadedFile) {
    const resourceType = file.mimetype.startsWith('video/') ? 'video' : 'image';
    const folder = this.buildUploadFolder(authorId);

    const upload = await this.cloudinary.uploadBuffer({
      buffer: file.buffer,
      folder,
      resourceType,
      overwrite: false,
    });

    return {
      folder,
      url: upload.url,
      secureUrl: upload.secureUrl,
      publicId: upload.publicId,
      resourceType: upload.resourceType,
      bytes: upload.bytes,
      format: upload.format,
      width: upload.width,
      height: upload.height,
      duration: upload.duration,
    };
  }

  private asObjectId(id: string, field: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ${field}`);
    }
    return new Types.ObjectId(id);
  }

  private normalizeMentions(raw: unknown, content: string) {
    type Mention = { userId?: string; username?: string };
    const map = new Map<string, Mention>();

    if (Array.isArray(raw)) {
      raw.forEach((val) => {
        if (typeof val === 'string') {
          const username = val.trim().replace(/^@/, '').toLowerCase();
          if (username && /^[a-z0-9_.]{1,30}$/i.test(username)) {
            const existing = map.get(username) ?? {};
            map.set(username, { ...existing, username });
          }
          return;
        }

        if (val && typeof val === 'object') {
          const username = val.username?.toString?.().trim?.();
          const userId = val.userId?.toString?.();
          if (username && /^[a-z0-9_.]{1,30}$/i.test(username)) {
            const key = username.toLowerCase();
            const existing = map.get(key) ?? {};
            map.set(key, {
              username: key,
              userId:
                userId && Types.ObjectId.isValid(userId)
                  ? new Types.ObjectId(userId).toString()
                  : existing.userId,
            });
          }
        }
      });
    }

    const regex = /@([a-zA-Z0-9_.]{1,30})/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content))) {
      const username = match[1].toLowerCase();
      const existing = map.get(username) ?? {};
      map.set(username, { ...existing, username });
    }

    return Array.from(map.entries())
      .slice(0, 20)
      .map(([username, value]) => {
        const userId =
          value.userId && Types.ObjectId.isValid(value.userId)
            ? new Types.ObjectId(value.userId)
            : undefined;
        return {
          userId,
          username,
        };
      });
  }

  private async notifyMentionedUsers(params: {
    actorId: string;
    postId: string;
    postKind: 'post' | 'reel';
    mentions: Array<{ userId?: Types.ObjectId; username: string }>;
  }): Promise<void> {
    const { actorId, postId, postKind, mentions } = params;
    if (!mentions.length) return;

    const directIds = mentions
      .map((m) => m.userId?.toString?.())
      .filter(Boolean) as string[];

    const missingUsernames = mentions
      .filter((m) => !m.userId)
      .map((m) => m.username)
      .filter(Boolean);

    const profiles = missingUsernames.length
      ? await this.profileModel
          .find({ username: { $in: missingUsernames } })
          .select('userId')
          .lean()
      : [];

    const resolvedIds = profiles
      .map((p) => p.userId?.toString?.())
      .filter(Boolean);

    const actorIdStr = actorId.toString();
    const recipientIds = Array.from(
      new Set([...directIds, ...resolvedIds]),
    ).filter((id) => id && id !== actorIdStr);

    await Promise.all(
      recipientIds.map((recipientId) =>
        this.notificationsService.createPostMentionNotification({
          actorId,
          recipientId,
          postId,
          postKind,
          source: 'comment',
        }),
      ),
    );
  }
}
