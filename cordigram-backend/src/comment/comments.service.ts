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
import { DeleteCommentDto } from './dto/delete-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { ConfigService } from '../config/config.service';

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
    @InjectModel(Profile.name)
    private readonly profileModel: Model<Profile>,
    private readonly blocksService: BlocksService,
    private readonly cloudinary: CloudinaryService,
    private readonly config: ConfigService,
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

    const content = dto.content?.trim?.() ?? '';
    const media = dto.media ?? null;
    if (!content && !media) {
      throw new BadRequestException('Comment content or media is required');
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

    const mentions = this.normalizeMentions(dto.mentions, content);

    const created = await this.commentModel.create({
      postId: postObjectId,
      authorId: userObjectId,
      content,
      mentions,
      media,
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
            {
              $match: {
                parentId: { $in: parentIds },
                deletedAt: null,
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
      .findOne({ _id: postObjectId, deletedAt: null })
      .select('authorId')
      .lean();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const comment = await this.commentModel
      .findOne({ _id: commentObjectId, postId: postObjectId, deletedAt: null })
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

    // Gather the subtree rooted at the target comment (target + all descendants).
    const idsToDelete: Types.ObjectId[] = [commentObjectId];
    const visited = new Set<string>([commentObjectId.toString()]);

    // BFS to collect all descendants by parentId.
    let frontier = [commentObjectId];
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

    const now = new Date();
    const deleteResult = await this.commentModel
      .updateMany(
        { _id: { $in: idsToDelete }, deletedAt: null },
        { $set: { deletedAt: now } },
      )
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
    }

    return { deleted: true, count: deletedCount };
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
      .findOne({ _id: commentObjectId, postId: postObjectId, deletedAt: null })
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

    const hasIncomingContent = typeof dto.content === 'string';
    const nextContent = hasIncomingContent
      ? (dto.content ?? '').trim()
      : (comment.content ?? '');
    const nextMedia =
      dto.media === undefined ? ((comment as any).media ?? null) : dto.media;

    if (!nextContent && !nextMedia) {
      throw new BadRequestException('Comment content or media is required');
    }

    const mentions = this.normalizeMentions(
      dto.mentions ?? comment.mentions ?? [],
      nextContent,
    );

    await this.commentModel
      .updateOne(
        { _id: commentObjectId },
        {
          $set: {
            content: nextContent,
            mentions,
            media: nextMedia,
            updatedAt: new Date(),
          },
        },
      )
      .exec();

    const profile = await this.profileModel
      .findOne({ userId: userObjectId })
      .select('userId displayName username avatarUrl')
      .lean();

    return this.toResponse(
      {
        ...comment,
        content: nextContent,
        mentions,
        media: nextMedia,
        updatedAt: new Date(),
      },
      profile || null,
      {
        repliesCount: 0,
        likesCount: 0,
        liked: false,
      },
    );
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
      mentions: Array.isArray(comment.mentions)
        ? comment.mentions.map((m) => {
            if (typeof m === 'string') {
              return { username: m };
            }
            return {
              userId: (m as any)?.userId?.toString?.(),
              username: (m as any)?.username,
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
      parentId: comment.parentId?.toString?.() ?? null,
      rootCommentId: comment.rootCommentId?.toString?.() ?? null,
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
      .findOne({ _id: postObjectId, deletedAt: null })
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
          const username = (val as any).username?.toString?.().trim?.();
          const userId = (val as any).userId?.toString?.();
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
}
