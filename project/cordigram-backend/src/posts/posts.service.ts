import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateReelDto } from './dto/create-reel.dto';
import { Post, PostStatus, PostStats } from './post.schema';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { ConfigService } from '../config/config.service';
import { PostInteraction, InteractionType } from './post-interaction.schema';
import { Follow } from '../users/follow.schema';
import { Profile } from '../profiles/profile.schema';
import { BlocksService } from '../users/blocks.service';
type UploadedFile = {
  buffer: Buffer;
  mimetype: string;
  size?: number;
  originalname?: string;
};

const REEL_MAX_DURATION_SECONDS = 90;

@Injectable()
export class PostsService {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(PostInteraction.name)
    private readonly postInteractionModel: Model<PostInteraction>,
    @InjectModel(Follow.name) private readonly followModel: Model<Follow>,
    @InjectModel(Profile.name) private readonly profileModel: Model<Profile>,
    private readonly blocksService: BlocksService,
    private readonly cloudinary: CloudinaryService,
    private readonly config: ConfigService,
  ) {}

  async create(authorId: string, dto: CreatePostDto) {
    const normalizedHashtags = this.normalizeHashtags(dto.hashtags ?? []);
    const normalizedMentions = this.normalizeMentions(dto.mentions ?? []);
    const normalizedTopics = this.normalizeTopics(dto.topics ?? []);

    let media = (dto.media ?? []).map((item) => ({
      type: item.type,
      url: item.url.trim(),
      metadata: item.metadata ?? null,
    }));

    let repostOf: Types.ObjectId | null = null;

    if (!media.length && !dto.repostOf) {
      throw new BadRequestException(
        'Please provide media or a repostOf target',
      );
    }

    if (dto.repostOf) {
      repostOf = new Types.ObjectId(dto.repostOf);
      const original = await this.postModel
        .findOne({ _id: repostOf, deletedAt: null })
        .lean();
      if (!original) {
        throw new NotFoundException('Original post not found');
      }
      if (!media.length) {
        media = (original.media ?? []).map((item) => ({
          type: item.type,
          url: item.url,
          metadata: item.metadata ?? null,
        }));
      }
    }

    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduledAt value');
    }

    const now = new Date();
    const status: PostStatus =
      scheduledAt && scheduledAt.getTime() > now.getTime()
        ? 'scheduled'
        : 'published';
    const publishedAt = status === 'published' ? now : null;

    const stats: PostStats = {
      hearts: 0,
      comments: 0,
      saves: 0,
      reposts: 0,
      shares: 0,
      impressions: 0,
      views: 0,
      hides: 0,
      reports: 0,
    };

    const doc = await this.postModel.create({
      kind: 'post',
      authorId: new Types.ObjectId(authorId),
      serverId: dto.serverId ? new Types.ObjectId(dto.serverId) : null,
      channelId: dto.channelId ? new Types.ObjectId(dto.channelId) : null,
      repostOf,
      content: typeof dto.content === 'string' ? dto.content : '',
      media,
      hashtags: normalizedHashtags,
      mentions: normalizedMentions,
      topics: normalizedTopics,
      location: dto.location?.trim() || null,
      visibility: dto.visibility ?? 'public',
      allowComments: dto.allowComments ?? true,
      allowDownload: dto.allowDownload ?? false,
      status,
      scheduledAt: scheduledAt ?? null,
      publishedAt,
      stats,
      deletedAt: null,
    });

    if (repostOf) {
      await this.postModel
        .updateOne({ _id: repostOf }, { $inc: { 'stats.reposts': 1 } })
        .exec();
    }

    return this.toResponse(doc);
  }

  async createReel(authorId: string, dto: CreateReelDto) {
    const normalizedHashtags = this.normalizeHashtags(dto.hashtags ?? []);
    const normalizedMentions = this.normalizeMentions(dto.mentions ?? []);
    const normalizedTopics = this.normalizeTopics(dto.topics ?? []);

    const media = (dto.media ?? []).map((item) => ({
      type: item.type,
      url: item.url.trim(),
      metadata: item.metadata ?? null,
    }));

    if (media.length !== 1 || media[0].type !== 'video') {
      throw new BadRequestException('Reels require exactly one video');
    }

    const duration =
      this.extractVideoDuration(media[0].metadata) ??
      dto.durationSeconds ??
      null;

    if (duration === null) {
      throw new BadRequestException('Missing video duration metadata');
    }

    if (duration > REEL_MAX_DURATION_SECONDS) {
      throw new BadRequestException(
        `Video exceeds ${REEL_MAX_DURATION_SECONDS} seconds limit`,
      );
    }

    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduledAt value');
    }

    const now = new Date();
    const status: PostStatus =
      scheduledAt && scheduledAt.getTime() > now.getTime()
        ? 'scheduled'
        : 'published';
    const publishedAt = status === 'published' ? now : null;

    const stats: PostStats = {
      hearts: 0,
      comments: 0,
      saves: 0,
      reposts: 0,
      shares: 0,
      impressions: 0,
      views: 0,
      hides: 0,
      reports: 0,
    };

    const doc = await this.postModel.create({
      kind: 'reel',
      authorId: new Types.ObjectId(authorId),
      serverId: dto.serverId ? new Types.ObjectId(dto.serverId) : null,
      channelId: dto.channelId ? new Types.ObjectId(dto.channelId) : null,
      repostOf: null,
      content: typeof dto.content === 'string' ? dto.content : '',
      media,
      hashtags: normalizedHashtags,
      mentions: normalizedMentions,
      topics: normalizedTopics,
      location: dto.location?.trim() || null,
      visibility: dto.visibility ?? 'public',
      allowComments: dto.allowComments ?? true,
      allowDownload: dto.allowDownload ?? false,
      status,
      scheduledAt: scheduledAt ?? null,
      publishedAt,
      stats,
      deletedAt: null,
    });

    return this.toResponse(doc);
  }

  private normalizeHashtags(tags: string[]): string[] {
    return Array.from(
      new Set(
        (tags ?? [])
          .map((tag) => tag?.toString().trim().replace(/^#/, '').toLowerCase())
          .filter(Boolean),
      ),
    ).slice(0, 30);
  }

  private normalizeMentions(handles: string[]): string[] {
    return Array.from(
      new Set(
        (handles ?? [])
          .map((h) => h?.toString().trim().replace(/^@/, '').toLowerCase())
          .filter(Boolean),
      ),
    ).slice(0, 30);
  }

  private normalizeTopics(topics: string[]): string[] {
    return Array.from(
      new Set(
        (topics ?? [])
          .map((t) => t?.toString().trim().toLowerCase())
          .filter(Boolean),
      ),
    ).slice(0, 20);
  }

  private toResponse(
    doc: Post,
    profile?: {
      userId?: Types.ObjectId;
      displayName?: string;
      username?: string;
      avatarUrl?: string;
    } | null,
    userFlags?: { liked?: boolean; saved?: boolean } | null,
  ) {
    return {
      kind: doc.kind,
      id: doc.id,
      authorId: doc.authorId?.toString?.(),
      authorDisplayName: profile?.displayName,
      authorUsername: profile?.username,
      authorAvatarUrl: profile?.avatarUrl,
      author: profile
        ? {
            id: profile.userId?.toString?.(),
            displayName: profile.displayName,
            username: profile.username,
            avatarUrl: profile.avatarUrl,
          }
        : undefined,
      content: doc.content,
      media: doc.media,
      hashtags: doc.hashtags,
      mentions: doc.mentions,
      topics: doc.topics,
      location: doc.location,
      visibility: doc.visibility,
      allowComments: doc.allowComments,
      allowDownload: doc.allowDownload,
      status: doc.status,
      scheduledAt: doc.scheduledAt,
      publishedAt: doc.publishedAt,
      stats: doc.stats,
      spamScore: doc.spamScore,
      qualityScore: doc.qualityScore,
      repostOf: doc.repostOf,
      serverId: doc.serverId,
      channelId: doc.channelId,
      liked: userFlags?.liked ?? false,
      saved: userFlags?.saved ?? false,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private extractVideoDuration(
    metadata?: Record<string, unknown> | null,
  ): number | null {
    const raw = (metadata as { duration?: unknown } | null | undefined)
      ?.duration;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
      return raw;
    }
    if (typeof raw === 'string') {
      const num = Number(raw);
      if (Number.isFinite(num) && num >= 0) {
        return num;
      }
    }
    return null;
  }

  async uploadMedia(authorId: string, file: UploadedFile) {
    if (!file) {
      throw new BadRequestException('Missing file');
    }

    return this.uploadSingle(authorId, file);
  }

  async uploadMediaBatch(authorId: string, files: UploadedFile[]) {
    if (!files || !files.length) {
      throw new BadRequestException('Missing files');
    }

    const uploads = [] as Array<{
      folder: string;
      url: string;
      secureUrl: string;
      publicId: string;
      resourceType: string;
      bytes: number;
      format?: string;
      width?: number;
      height?: number;
      duration?: number;
      originalName?: string;
    }>;

    for (const file of files) {
      const result = await this.uploadSingle(authorId, file);
      uploads.push({ ...result, originalName: file.originalname });
    }

    return uploads;
  }

  private buildUploadFolder(authorId: string): string {
    const now = new Date();
    const parts = [
      this.config.cloudinaryFolder,
      'posts',
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

  async getFeed(userId: string, limit = 20) {
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const userObjectId = this.asObjectId(userId, 'userId');

    const hidden = await this.postInteractionModel
      .find({ userId: userObjectId, type: 'hide' })
      .select('postId')
      .lean();
    const hiddenIds = new Set(
      hidden.map((h) => h.postId?.toString?.()).filter(Boolean),
    );

    const followees = await this.followModel
      .find({ followerId: userObjectId })
      .select('followeeId')
      .lean();

    const followeeIds = followees.map((f) => f.followeeId.toString());
    const followeeSet = new Set(followeeIds);
    const followeeObjectIds = followeeIds.map((id) => new Types.ObjectId(id));

    const now = new Date();
    const freshnessWindow = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const { blockedIds, blockedByIds } =
      await this.blocksService.getBlockLists(userObjectId);
    const excludedAuthorIds = Array.from(
      new Set([...blockedIds, ...blockedByIds]),
      (id) => new Types.ObjectId(id),
    );

    const followCandidates = await this.postModel
      .find({
        authorId: { $in: followeeObjectIds, $nin: excludedAuthorIds },
        status: 'published',
        visibility: { $ne: 'private' },
        deletedAt: null,
        publishedAt: { $ne: null },
        _id: { $nin: Array.from(hiddenIds, (id) => new Types.ObjectId(id)) },
      })
      .sort({ createdAt: -1 })
      .limit(safeLimit * 2)
      .lean();

    const exploreCandidates = await this.postModel
      .find({
        authorId: { $nin: [...followeeObjectIds, ...excludedAuthorIds] },
        status: 'published',
        visibility: 'public',
        deletedAt: null,
        publishedAt: { $ne: null },
        createdAt: { $gte: freshnessWindow },
        _id: { $nin: Array.from(hiddenIds, (id) => new Types.ObjectId(id)) },
      })
      .sort({ 'stats.hearts': -1, 'stats.comments': -1, createdAt: -1 })
      .limit(safeLimit * 2)
      .lean();

    const merged: Post[] = [];
    const seen = new Set<string>();

    for (const raw of [...followCandidates, ...exploreCandidates]) {
      const id = raw._id?.toString?.();
      if (!id || seen.has(id) || hiddenIds.has(id)) {
        continue;
      }
      merged.push(this.postModel.hydrate(raw) as Post);
      seen.add(id);
    }

    const topPosts = merged
      .map((post) => ({ post, score: this.scorePost(post, followeeSet, now) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, safeLimit)
      .map((item) => item.post);

    const authorIds = Array.from(
      new Set(
        topPosts
          .map((p) => p.authorId?.toString?.())
          .filter((id): id is string => Boolean(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const profiles = await this.profileModel
      .find({ userId: { $in: authorIds } })
      .select('userId displayName username avatarUrl')
      .lean();

    const profileMap = new Map(profiles.map((p) => [p.userId.toString(), p]));

    const postIds = topPosts.map((p) => p._id);
    const interactions = await this.postInteractionModel
      .find({ userId: userObjectId, postId: { $in: postIds } })
      .select('postId type')
      .lean();

    const interactionMap = new Map<
      string,
      { liked?: boolean; saved?: boolean }
    >();

    interactions.forEach((item) => {
      const key = item.postId?.toString?.();
      if (!key) return;
      const current = interactionMap.get(key) || {};
      if (item.type === 'like') current.liked = true;
      if (item.type === 'save') current.saved = true;
      interactionMap.set(key, current);
    });

    return topPosts.map((post) => {
      const profile = profileMap.get(post.authorId?.toString?.() ?? '') || null;
      const flags = interactionMap.get(post._id?.toString?.() ?? '') || null;
      return this.toResponse(post, profile, flags);
    });
  }

  async getById(userId: string, postId: string) {
    const { userObjectId, postObjectId } = await this.resolveIds(
      userId,
      postId,
    );

    const post = await this.postModel
      .findOne({ _id: postObjectId, deletedAt: null })
      .lean();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const isAuthor = post.authorId?.toString?.() === userId;

    if (!isAuthor && post.status !== 'published') {
      throw new ForbiddenException('Post is not published');
    }

    if (!isAuthor && post.visibility === 'private') {
      throw new ForbiddenException('Post is private');
    }

    await this.blocksService.assertNotBlocked(userObjectId, post.authorId);

    const profile = await this.profileModel
      .findOne({ userId: post.authorId })
      .select('userId displayName username avatarUrl')
      .lean();

    const interactions = await this.postInteractionModel
      .find({
        userId: userObjectId,
        postId: postObjectId,
        type: { $in: ['like', 'save'] },
      })
      .select('type')
      .lean();

    const flags = interactions.reduce<{ liked?: boolean; saved?: boolean }>(
      (acc, item) => {
        if (item.type === 'like') acc.liked = true;
        if (item.type === 'save') acc.saved = true;
        return acc;
      },
      {},
    );

    return this.toResponse(
      this.postModel.hydrate(post) as Post,
      profile || null,
      flags,
    );
  }

  async like(userId: string, postId: string) {
    const { postObjectId, userObjectId } = await this.resolveIds(
      userId,
      postId,
    );
    await this.assertPostAccessible(userObjectId, postObjectId);

    const inserted = await this.upsertUniqueInteraction(
      userObjectId,
      postObjectId,
      'like',
      true,
    );
    if (inserted) {
      await this.bumpCounters(postObjectId, { 'stats.hearts': 1 });
    }
    return { liked: true, created: inserted };
  }

  async unlike(userId: string, postId: string) {
    const { postObjectId, userObjectId } = await this.resolveIds(
      userId,
      postId,
    );
    await this.assertPostAccessible(userObjectId, postObjectId);

    const removed = await this.removeUniqueInteraction(
      userObjectId,
      postObjectId,
      'like',
      true,
    );
    if (removed) {
      await this.bumpCounters(postObjectId, { 'stats.hearts': -1 });
    }
    return { liked: !removed };
  }

  async save(userId: string, postId: string) {
    const { postObjectId, userObjectId } = await this.resolveIds(
      userId,
      postId,
    );
    await this.assertPostAccessible(userObjectId, postObjectId);

    const inserted = await this.upsertUniqueInteraction(
      userObjectId,
      postObjectId,
      'save',
      true,
    );
    if (inserted) {
      await this.bumpCounters(postObjectId, { 'stats.saves': 1 });
    }
    return { saved: true, created: inserted };
  }

  async unsave(userId: string, postId: string) {
    const { postObjectId, userObjectId } = await this.resolveIds(
      userId,
      postId,
    );
    await this.assertPostAccessible(userObjectId, postObjectId);

    const removed = await this.removeUniqueInteraction(
      userObjectId,
      postObjectId,
      'save',
      true,
    );
    if (removed) {
      await this.bumpCounters(postObjectId, { 'stats.saves': -1 });
    }
    return { saved: !removed };
  }

  async share(userId: string, postId: string) {
    const { postObjectId, userObjectId } = await this.resolveIds(
      userId,
      postId,
    );
    await this.assertPostAccessible(userObjectId, postObjectId);

    const inserted = await this.upsertUniqueInteraction(
      userObjectId,
      postObjectId,
      'share',
      true,
    );
    if (inserted) {
      await this.bumpCounters(postObjectId, { 'stats.shares': 1 });
    }
    return { shared: true };
  }

  async hide(userId: string, postId: string) {
    const { postObjectId, userObjectId } = await this.resolveIds(
      userId,
      postId,
    );
    await this.assertPostAccessible(userObjectId, postObjectId);

    const inserted = await this.upsertUniqueInteraction(
      userObjectId,
      postObjectId,
      'hide',
      true,
    );
    if (inserted) {
      await this.bumpCounters(postObjectId, { 'stats.hides': 1 });
    }
    return { hidden: true };
  }

  async report(userId: string, postId: string) {
    const { postObjectId, userObjectId } = await this.resolveIds(
      userId,
      postId,
    );
    await this.assertPostAccessible(userObjectId, postObjectId);

    const inserted = await this.upsertUniqueInteraction(
      userObjectId,
      postObjectId,
      'report',
      true,
    );
    if (inserted) {
      await this.bumpCounters(postObjectId, { 'stats.reports': 1 });
    }
    return { reported: true };
  }

  async view(userId: string, postId: string, durationMs?: number) {
    const { postObjectId, userObjectId } = await this.resolveIds(
      userId,
      postId,
    );
    await this.assertPostAccessible(userObjectId, postObjectId);

    await this.postInteractionModel.create({
      userId: userObjectId,
      postId: postObjectId,
      type: 'view',
      durationMs: durationMs ?? null,
    });

    await this.bumpCounters(postObjectId, {
      'stats.views': 1,
      'stats.impressions': 1,
    });

    return { viewed: true };
  }

  private async assertPostAccessible(
    viewerId: Types.ObjectId,
    postId: Types.ObjectId,
  ) {
    const post = await this.postModel
      .findOne({ _id: postId, deletedAt: null })
      .select('authorId')
      .lean();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (!post.authorId) {
      throw new ForbiddenException('Post author missing');
    }

    await this.blocksService.assertNotBlocked(viewerId, post.authorId);
    return post;
  }

  private scorePost(post: Post, followeeSet: Set<string>, now: Date) {
    const createdAt = post.createdAt ? new Date(post.createdAt) : now;
    const ageHours = Math.max(
      0.1,
      (now.getTime() - createdAt.getTime()) / 3_600_000,
    );
    const freshness = 1 / (1 + ageHours / 12);
    const stats = post.stats ?? ({} as PostStats);
    const engagement =
      (stats.hearts ?? 0) * 2 +
      (stats.comments ?? 0) * 3 +
      (stats.saves ?? 0) * 4 +
      (stats.shares ?? 0) * 3 +
      (stats.reposts ?? 0) * 3 +
      (stats.views ?? 0) * 0.3 +
      (stats.impressions ?? 0) * 0.1;

    const qualityBoost =
      1 + ((post.qualityScore ?? 0) - (post.spamScore ?? 0)) * 0.01;
    const relationshipBoost = followeeSet.has(post.authorId?.toString?.() ?? '')
      ? 1.3
      : 1;

    return (engagement + 1) * freshness * qualityBoost * relationshipBoost;
  }

  private async upsertUniqueInteraction(
    userId: Types.ObjectId,
    postId: Types.ObjectId,
    type: InteractionType,
    skipEnsureExists = false,
  ) {
    if (!skipEnsureExists) {
      await this.ensurePostExists(postId);
    }
    const result = await this.postInteractionModel
      .updateOne(
        { userId, postId, type },
        { $setOnInsert: { userId, postId, type } },
        { upsert: true },
      )
      .exec();

    return Boolean((result as { upsertedCount?: number }).upsertedCount);
  }

  private async removeUniqueInteraction(
    userId: Types.ObjectId,
    postId: Types.ObjectId,
    type: InteractionType,
    skipEnsureExists = false,
  ) {
    if (!skipEnsureExists) {
      await this.ensurePostExists(postId);
    }
    const result = await this.postInteractionModel
      .deleteOne({ userId, postId, type })
      .exec();
    return result.deletedCount === 1;
  }

  private async bumpCounters(
    postId: Types.ObjectId,
    inc: Record<string, number>,
  ) {
    await this.postModel.updateOne({ _id: postId }, { $inc: inc }).exec();
  }

  private async ensurePostExists(postId: Types.ObjectId) {
    const exists = await this.postModel
      .findOne({ _id: postId, deletedAt: null })
      .select('_id')
      .lean();
    if (!exists) {
      throw new NotFoundException('Post not found');
    }
  }

  private asObjectId(id: string, field: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ${field}`);
    }
    return new Types.ObjectId(id);
  }

  private async resolveIds(userId: string, postId: string) {
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    const userObjectId = this.asObjectId(userId, 'userId');
    const postObjectId = this.asObjectId(postId, 'postId');
    return { userObjectId, postObjectId };
  }
}
