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
import { CreateCommentDto } from '../comment/dto/create-comment.dto';
import { BlocksService } from '../users/blocks.service';
import { Profile } from '../profiles/profile.schema';

@Injectable()
export class CommentsService {
  constructor(
    @InjectModel(Comment.name)
    private readonly commentModel: Model<Comment>,
    @InjectModel(CommentLike.name)
    private readonly commentLikeModel: Model<CommentLike>,
    @InjectModel(Post.name)
    private readonly postModel: Model<Post>,
    @InjectModel(Profile.name)
    private readonly profileModel: Model<Profile>,
    private readonly blocksService: BlocksService,
  ) {}

  async create(userId: string, postId: string, dto: CreateCommentDto) {
    const userObjectId = this.asObjectId(userId, 'userId');
    const postObjectId = this.asObjectId(postId, 'postId');

    const post = await this.postModel
      .findOne({ _id: postObjectId, deletedAt: null })
      .select('authorId allowComments status')
      .lean();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    await this.blocksService.assertNotBlocked(userObjectId, post.authorId);

    if (post.allowComments === false) {
      throw new ForbiddenException();
    }

    const content = dto.content?.trim?.();
    if (!content) {
      throw new BadRequestException('Comment content is required');
    }

    let parentId: Types.ObjectId | null = null;
    let rootCommentId: Types.ObjectId | null = null;

    if (dto.parentId) {
      if (!Types.ObjectId.isValid(dto.parentId)) {
        throw new BadRequestException('Invalid parentId');
      }
      parentId = new Types.ObjectId(dto.parentId);
      const parent = await this.commentModel
        .findOne({ _id: parentId, postId: postObjectId, deletedAt: null })
        .select('_id rootCommentId')
        .lean();

      if (!parent) {
        throw new NotFoundException('Parent comment not found');
      }

      rootCommentId = parent.rootCommentId ?? parent._id;
    }

    const created = await this.commentModel.create({
      postId: postObjectId,
      authorId: userObjectId,
      content,
      parentId,
      rootCommentId,
      deletedAt: null,
    });

    await this.postModel
      .updateOne({ _id: postObjectId }, { $inc: { 'stats.comments': 1 } })
      .exec();

    const profile = await this.profileModel
      .findOne({ userId: userObjectId })
      .select('userId displayName username avatarUrl')
      .lean();

    return this.toResponse(created, profile || null, {
      repliesCount: 0,
      likesCount: 0,
      liked: false,
    });
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
      .findOne({ _id: postObjectId, deletedAt: null })
      .select('authorId allowComments status')
      .lean();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    await this.blocksService.assertNotBlocked(userObjectId, post.authorId);

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
    };

    if (options?.parentId) {
      const parentObjectId = this.asObjectId(options.parentId, 'parentId');
      query.parentId = parentObjectId;
    } else {
      query.parentId = null;
    }

    const comments = await this.commentModel
      .find(query)
      .sort({ createdAt: 1, _id: 1 })
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
            { $match: { parentId: { $in: parentIds }, deletedAt: null } },
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
        });
      }),
    };
  }

  async likeComment(userId: string, postId: string, commentId: string) {
    const userObjectId = this.asObjectId(userId, 'userId');
    const postObjectId = this.asObjectId(postId, 'postId');
    const commentObjectId = this.asObjectId(commentId, 'commentId');

    const comment = await this.commentModel
      .findOne({ _id: commentObjectId, postId: postObjectId, deletedAt: null })
      .select('authorId')
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

    return { liked: true, created, likesCount };
  }

  async unlikeComment(userId: string, postId: string, commentId: string) {
    const userObjectId = this.asObjectId(userId, 'userId');
    const postObjectId = this.asObjectId(postId, 'postId');
    const commentObjectId = this.asObjectId(commentId, 'commentId');

    const comment = await this.commentModel
      .findOne({ _id: commentObjectId, postId: postObjectId, deletedAt: null })
      .select('authorId')
      .lean();

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    await this.blocksService.assertNotBlocked(userObjectId, comment.authorId);

    await this.commentLikeModel
      .deleteOne({ commentId: commentObjectId, userId: userObjectId })
      .exec();

    const likesCount = await this.commentLikeModel.countDocuments({
      commentId: commentObjectId,
    });
    return { liked: false, likesCount };
  }

  private toResponse(
    comment: Comment | Record<string, any>,
    profile: Profile | Record<string, any> | null,
    extras?: { repliesCount?: number; likesCount?: number; liked?: boolean },
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
          }
        : undefined,
      content: comment.content,
      parentId: comment.parentId?.toString?.() ?? null,
      rootCommentId: comment.rootCommentId?.toString?.() ?? null,
      createdAt: (comment as { createdAt?: Date }).createdAt,
      updatedAt: (comment as { updatedAt?: Date }).updatedAt,
      repliesCount: extras?.repliesCount ?? 0,
      likesCount: extras?.likesCount ?? 0,
      liked: extras?.liked ?? false,
    };
  }

  private asObjectId(id: string, field: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ${field}`);
    }
    return new Types.ObjectId(id);
  }
}
