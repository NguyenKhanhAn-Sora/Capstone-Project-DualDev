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
import { UpdatePostDto } from './dto/update-post.dto';
import {
  Post,
  PostKind,
  PostStatus,
  PostStats,
  Visibility,
} from './post.schema';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { ConfigService } from '../config/config.service';
import { PostInteraction, InteractionType } from './post-interaction.schema';
import { Follow } from '../users/follow.schema';
import { Profile } from '../profiles/profile.schema';
import { BlocksService } from '../users/blocks.service';
import { Hashtag } from '../hashtags/hashtag.schema';
import { UserTasteProfile } from '../explore/user-taste.schema';
import { PostImpressionEvent } from '../explore/impression-event.schema';
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
    @InjectModel(Hashtag.name) private readonly hashtagModel: Model<Hashtag>,
    @InjectModel(UserTasteProfile.name)
    private readonly tasteProfileModel: Model<UserTasteProfile>,
    @InjectModel(PostImpressionEvent.name)
    private readonly impressionEventModel: Model<PostImpressionEvent>,
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

    const primaryVideo = media.find((m) => m.type === 'video') ?? null;
    const primaryVideoDuration = primaryVideo
      ? this.extractVideoDuration(primaryVideo.metadata)
      : null;
    const primaryVideoDurationMs =
      primaryVideoDuration === null
        ? null
        : Math.max(0, Math.round(primaryVideoDuration * 1000));

    const doc = await this.postModel.create({
      kind: 'post',
      authorId: new Types.ObjectId(authorId),
      serverId: dto.serverId ? new Types.ObjectId(dto.serverId) : null,
      channelId: dto.channelId ? new Types.ObjectId(dto.channelId) : null,
      repostOf,
      content: typeof dto.content === 'string' ? dto.content : '',
      media,
      primaryVideoDurationMs,
      hashtags: normalizedHashtags,
      mentions: normalizedMentions,
      topics: normalizedTopics,
      location: dto.location?.trim() || null,
      visibility: dto.visibility ?? 'public',
      allowComments: dto.allowComments ?? true,
      allowDownload: dto.allowDownload ?? false,
      hideLikeCount: dto.hideLikeCount ?? false,
      status,
      scheduledAt: scheduledAt ?? null,
      publishedAt,
      stats,
      deletedAt: null,
    });

    await this.upsertHashtags(normalizedHashtags);

    if (repostOf) {
      await this.postModel
        .updateOne({ _id: repostOf }, { $inc: { 'stats.reposts': 1 } })
        .exec();
    }

    return this.toResponse(doc);
  }

  async update(authorId: string, postId: string, dto: UpdatePostDto) {
    if (!dto || Object.keys(dto).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    const { userObjectId, postObjectId } = await this.resolveIds(
      authorId,
      postId,
    );

    const post = await this.postModel
      .findOne({ _id: postObjectId, deletedAt: null })
      .select('authorId hashtags')
      .lean();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (!post.authorId || !post.authorId.equals(userObjectId)) {
      throw new ForbiddenException('Only the author can edit this post');
    }

    const update: Record<string, unknown> = {};
    const prevHashtags = Array.isArray(post.hashtags) ? post.hashtags : [];
    let addedHashtags: string[] = [];
    let removedHashtags: string[] = [];

    if (dto.content !== undefined) {
      update.content = dto.content ?? '';
    }
    if (dto.hashtags !== undefined) {
      const nextHashtags = this.normalizeHashtags(dto.hashtags ?? []);
      update.hashtags = nextHashtags;
      const prevSet = new Set(prevHashtags);
      const nextSet = new Set(nextHashtags);
      addedHashtags = nextHashtags.filter((tag) => !prevSet.has(tag));
      removedHashtags = prevHashtags.filter((tag) => !nextSet.has(tag));
    }
    if (dto.mentions !== undefined) {
      update.mentions = this.normalizeMentions(dto.mentions ?? []);
    }
    if (dto.topics !== undefined) {
      update.topics = this.normalizeTopics(dto.topics ?? []);
    }
    if (dto.location !== undefined) {
      update.location = dto.location?.trim() || null;
    }
    if (dto.visibility !== undefined) {
      update.visibility = dto.visibility;
    }
    if (typeof dto.allowComments === 'boolean') {
      update.allowComments = dto.allowComments;
    }
    if (typeof dto.allowDownload === 'boolean') {
      update.allowDownload = dto.allowDownload;
    }
    if (typeof dto.hideLikeCount === 'boolean') {
      update.hideLikeCount = dto.hideLikeCount;
    }

    if (!Object.keys(update).length) {
      throw new BadRequestException('No changes provided');
    }

    await this.postModel
      .updateOne({ _id: postObjectId }, { $set: update })
      .exec();

    if (addedHashtags.length) {
      await this.upsertHashtags(addedHashtags);
    }
    if (removedHashtags.length) {
      await this.decrementHashtags(removedHashtags);
    }

    const fresh = await this.postModel
      .findOne({ _id: postObjectId, deletedAt: null })
      .lean();

    if (!fresh) {
      throw new NotFoundException('Post not found after update');
    }

    return this.toResponse(this.postModel.hydrate(fresh) as Post);
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

    const durationMs = duration === null ? null : Math.round(duration * 1000);

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
      primaryVideoDurationMs: durationMs,
      hashtags: normalizedHashtags,
      mentions: normalizedMentions,
      topics: normalizedTopics,
      location: dto.location?.trim() || null,
      visibility: dto.visibility ?? 'public',
      allowComments: dto.allowComments ?? true,
      allowDownload: dto.allowDownload ?? false,
      hideLikeCount: dto.hideLikeCount ?? false,
      status,
      scheduledAt: scheduledAt ?? null,
      publishedAt,
      stats,
      deletedAt: null,
    });

    await this.upsertHashtags(normalizedHashtags);

    return this.toResponse(doc);
  }

  async delete(userId: string, postId: string) {
    const { userObjectId, postObjectId } = await this.resolveIds(
      userId,
      postId,
    );

    const post = await this.postModel
      .findOne({ _id: postObjectId, deletedAt: null })
      .select('authorId kind hashtags')
      .lean();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (!post.authorId || !post.authorId.equals(userObjectId)) {
      throw new ForbiddenException('Only the author can delete this post');
    }

    const result = await this.postModel
      .updateOne(
        { _id: postObjectId, deletedAt: null },
        { $set: { deletedAt: new Date() } },
      )
      .exec();

    if (!result.modifiedCount) {
      throw new BadRequestException('Unable to delete post');
    }

    await this.postInteractionModel.deleteMany({ postId: postObjectId }).exec();

    if (Array.isArray(post.hashtags) && post.hashtags.length) {
      await this.decrementHashtags(post.hashtags);
    }

    return { deleted: true };
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

  private async upsertHashtags(tags: string[]) {
    if (!tags.length) return;
    const now = new Date();
    await this.hashtagModel.bulkWrite(
      tags.map((tag) => ({
        updateOne: {
          filter: { name: tag },
          update: {
            $setOnInsert: { name: tag },
            $set: { lastUsedAt: now },
            $inc: { usageCount: 1 },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }

  private async decrementHashtags(tags: string[]) {
    if (!tags.length) return;
    await this.hashtagModel.bulkWrite(
      tags.map((tag) => ({
        updateOne: {
          filter: { name: tag },
          update: {
            $inc: { usageCount: -1 },
          },
        },
      })),
      { ordered: false },
    );
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
    userFlags?: {
      liked?: boolean;
      saved?: boolean;
      following?: boolean;
      reposted?: boolean;
    } | null,
    repostSourceProfile?: {
      userId?: Types.ObjectId;
      displayName?: string;
      username?: string;
      avatarUrl?: string;
    } | null,
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
      hideLikeCount: doc.hideLikeCount,
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
      following: userFlags?.following ?? false,
      reposted: userFlags?.reposted ?? false,
      repostOfAuthorId: repostSourceProfile?.userId?.toString?.(),
      repostOfAuthorDisplayName: repostSourceProfile?.displayName,
      repostOfAuthorUsername: repostSourceProfile?.username,
      repostOfAuthorAvatarUrl: repostSourceProfile?.avatarUrl,
      repostOfAuthor: repostSourceProfile
        ? {
            id: repostSourceProfile.userId?.toString?.(),
            displayName: repostSourceProfile.displayName,
            username: repostSourceProfile.username,
            avatarUrl: repostSourceProfile.avatarUrl,
          }
        : undefined,
      flags: {
        liked: userFlags?.liked ?? false,
        saved: userFlags?.saved ?? false,
        following: userFlags?.following ?? false,
        reposted: userFlags?.reposted ?? false,
      },
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private extractVideoDuration(
    metadata?: Record<string, unknown> | null,
  ): number | null {
    const meta = metadata as
      | { duration?: unknown; durationMs?: unknown }
      | null
      | undefined;

    const rawMs = meta?.durationMs;
    if (typeof rawMs === 'number' && Number.isFinite(rawMs) && rawMs >= 0) {
      return rawMs / 1000;
    }
    if (typeof rawMs === 'string') {
      const numMs = Number(rawMs);
      if (Number.isFinite(numMs) && numMs >= 0) {
        return numMs / 1000;
      }
    }

    const raw = meta?.duration;
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

  async getFeed(
    userId: string,
    limit = 20,
    kinds: PostKind[] = ['post', 'reel'],
    page = 1,
  ) {
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const allowedKinds = kinds.length ? kinds : ['post', 'reel'];

    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const safePage = Math.min(Math.max(page || 1, 1), 50);
    const sliceStart = (safePage - 1) * safeLimit;
    const sliceEnd = sliceStart + safeLimit;
    const candidateLimit = Math.min(safeLimit * 2 * safePage, 500);
    const userObjectId = this.asObjectId(userId, 'userId');

    const hidden = await this.postInteractionModel
      .find({ userId: userObjectId, type: { $in: ['hide', 'report'] } })
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

    // Keep explore somewhat fresh to feel more like modern social feeds.
    const now = new Date();
    const exploreFreshnessWindow = new Date(
      now.getTime() - 14 * 24 * 60 * 60 * 1000,
    );

    const { blockedIds, blockedByIds } =
      await this.blocksService.getBlockLists(userObjectId);
    const excludedAuthorIds = Array.from(
      new Set([...blockedIds, ...blockedByIds]),
      (id) => new Types.ObjectId(id),
    );

    const ownedCandidates = await this.postModel
      .find({
        authorId: userObjectId,
        kind: { $in: allowedKinds },
        status: 'published',
        deletedAt: null,
        publishedAt: { $ne: null },
        _id: { $nin: Array.from(hiddenIds, (id) => new Types.ObjectId(id)) },
      })
      .sort({ createdAt: -1 })
      .limit(candidateLimit)
      .lean();

    const followCandidates = await this.postModel
      .find({
        authorId: { $in: followeeObjectIds, $nin: excludedAuthorIds },
        kind: { $in: allowedKinds },
        status: 'published',
        visibility: { $ne: 'private' },
        deletedAt: null,
        publishedAt: { $ne: null },
        _id: { $nin: Array.from(hiddenIds, (id) => new Types.ObjectId(id)) },
      })
      .sort({ createdAt: -1 })
      .limit(candidateLimit)
      .lean();

    const exploreCandidates = await this.postModel
      .find({
        authorId: { $nin: [...followeeObjectIds, ...excludedAuthorIds] },
        kind: { $in: allowedKinds },
        status: 'published',
        visibility: 'public',
        deletedAt: null,
        publishedAt: { $ne: null },
        createdAt: { $gte: exploreFreshnessWindow },
        _id: { $nin: Array.from(hiddenIds, (id) => new Types.ObjectId(id)) },
      })
      .sort({ 'stats.hearts': -1, 'stats.comments': -1, createdAt: -1 })
      .limit(candidateLimit)
      .lean();

    const merged: Post[] = [];
    const seen = new Set<string>();

    const pushCandidate = (raw: unknown) => {
      const candidate = raw as Post;
      // Handle lean documents safely and avoid duplicates/hidden posts
      const id = (
        candidate as { _id?: Types.ObjectId | string }
      )?._id?.toString?.();
      if (!id || seen.has(id) || hiddenIds.has(id)) {
        return;
      }
      merged.push(this.postModel.hydrate(candidate) as Post);
      seen.add(id);
    };

    [...ownedCandidates, ...followCandidates, ...exploreCandidates].forEach(
      (raw) => pushCandidate(raw),
    );

    const mergedIds = merged
      .map((p) => p._id?.toString?.())
      .filter((id): id is string => Boolean(id));

    const viewed = await this.postInteractionModel
      .find({
        userId: userObjectId,
        postId: { $in: mergedIds.map((id) => new Types.ObjectId(id)) },
        type: 'view',
      })
      .select('postId')
      .lean();

    const viewedIds = new Set(
      viewed.map((v) => v.postId?.toString?.()).filter(Boolean),
    );

    const scored = merged
      .map((post) => ({ post, score: this.scorePost(post, followeeSet, now) }))
      .sort((a, b) => b.score - a.score);

    const prioritizedAll = [
      ...scored.filter((item) =>
        item.post._id ? !viewedIds.has(item.post._id.toString()) : true,
      ),
      ...scored.filter((item) =>
        item.post._id ? viewedIds.has(item.post._id.toString()) : false,
      ),
    ];

    let prioritized = prioritizedAll;

    // If mixing post + reel, keep a reasonable ratio so home doesn't become all reels.
    // (Still keeps internal order/score within each kind.)
    if (allowedKinds.includes('post') && allowedKinds.includes('reel')) {
      const maxReels = Math.max(1, Math.floor(safeLimit * 0.3));
      const reels = prioritized.filter((x) => x.post.kind === 'reel');
      const posts = prioritized.filter((x) => x.post.kind !== 'reel');

      const mixed: typeof prioritized = [];
      let reelCount = 0;
      let postIndex = 0;
      let reelIndex = 0;

      // Simple pattern: 3 posts then 1 reel (when available), capped by maxReels.
      while (mixed.length < prioritized.length) {
        for (let i = 0; i < 3 && postIndex < posts.length; i++) {
          mixed.push(posts[postIndex++]);
        }
        if (reelIndex < reels.length && reelCount < maxReels) {
          mixed.push(reels[reelIndex++]);
          reelCount++;
        }

        if (
          postIndex >= posts.length &&
          (reelIndex >= reels.length || reelCount >= maxReels)
        ) {
          break;
        }
      }

      // Fill remaining with posts first, then reels if still under cap.
      while (mixed.length < prioritized.length && postIndex < posts.length) {
        mixed.push(posts[postIndex++]);
      }
      while (
        mixed.length < prioritized.length &&
        reelIndex < reels.length &&
        reelCount < maxReels
      ) {
        mixed.push(reels[reelIndex++]);
        reelCount++;
      }

      prioritized = mixed;
    }

    const pagePosts = prioritized
      .slice(sliceStart, sliceEnd)
      .map((item) => item.post);

    const authorIds = Array.from(
      new Set(
        pagePosts
          .map((p) => p.authorId?.toString?.())
          .filter((id): id is string => Boolean(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const profiles = await this.profileModel
      .find({ userId: { $in: authorIds } })
      .select('userId displayName username avatarUrl')
      .lean();

    const profileMap = new Map(profiles.map((p) => [p.userId.toString(), p]));

    const repostSourceIds = Array.from(
      new Set(
        pagePosts
          .map((p) => p.repostOf?.toString?.())
          .filter((id): id is string => Boolean(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    let repostSourceProfileMap = new Map<
      string,
      (typeof profiles)[number] | null
    >();

    if (repostSourceIds.length) {
      const repostSources = await this.postModel
        .find({ _id: { $in: repostSourceIds }, deletedAt: null })
        .select('authorId')
        .lean();

      const repostAuthorIds = Array.from(
        new Set(
          repostSources
            .map((p) => p.authorId?.toString?.())
            .filter((id): id is string => Boolean(id)),
        ),
      ).map((id) => new Types.ObjectId(id));

      if (repostAuthorIds.length) {
        const repostProfiles = await this.profileModel
          .find({ userId: { $in: repostAuthorIds } })
          .select('userId displayName username avatarUrl')
          .lean();

        repostProfiles.forEach((p) => profileMap.set(p.userId.toString(), p));

        repostSourceProfileMap = new Map(
          repostSources
            .map((src) => {
              const key = src._id?.toString?.();
              if (!key) return null;
              const prof = src.authorId
                ? profileMap.get(src.authorId.toString()) || null
                : null;
              return [key, prof] as [string, (typeof profiles)[number] | null];
            })
            .filter(Boolean) as Array<
            [string, (typeof profiles)[number] | null]
          >,
        );
      }
    }

    const postIds = pagePosts.map((p) => p._id);
    const interactions = await this.postInteractionModel
      .find({
        userId: userObjectId,
        postId: { $in: postIds },
        type: { $in: ['like', 'save', 'repost'] },
      })
      .select('postId type')
      .lean();

    const interactionMap = new Map<
      string,
      { liked?: boolean; saved?: boolean; reposted?: boolean }
    >();

    interactions.forEach((item) => {
      const key = item.postId?.toString?.();
      if (!key) return;
      const current = interactionMap.get(key) || {};
      if (item.type === 'like') current.liked = true;
      if (item.type === 'save') current.saved = true;
      if (item.type === 'repost') current.reposted = true;
      interactionMap.set(key, current);
    });

    return pagePosts.map((post) => {
      const profile = profileMap.get(post.authorId?.toString?.() ?? '') || null;
      const baseFlags = interactionMap.get(post._id?.toString?.() ?? '') || {};
      const following = post.authorId
        ? followeeSet.has(post.authorId.toString())
        : false;
      const repostProfile = post.repostOf
        ? repostSourceProfileMap.get(post.repostOf.toString()) || null
        : null;
      return this.toResponse(
        post,
        profile,
        { ...baseFlags, following },
        repostProfile,
      );
    });
  }

  async getFollowingFeed(
    userId: string,
    limit = 20,
    kinds: PostKind[] = ['post', 'reel'],
    page = 1,
  ) {
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const allowedKinds = kinds.length ? kinds : ['post', 'reel'];
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const safePage = Math.min(Math.max(page || 1, 1), 50);
    const sliceStart = (safePage - 1) * safeLimit;
    const sliceEnd = sliceStart + safeLimit;
    const candidateLimit = Math.min(safeLimit * 2 * safePage, 500);
    const userObjectId = this.asObjectId(userId, 'userId');

    const hidden = await this.postInteractionModel
      .find({ userId: userObjectId, type: { $in: ['hide', 'report'] } })
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
    if (!followeeIds.length) {
      return [];
    }

    const followeeObjectIds = followeeIds.map((id) => new Types.ObjectId(id));

    const { blockedIds, blockedByIds } =
      await this.blocksService.getBlockLists(userObjectId);
    const excludedAuthorIds = Array.from(
      new Set([...blockedIds, ...blockedByIds]),
      (id) => new Types.ObjectId(id),
    );

    const followCandidates = await this.postModel
      .find({
        authorId: { $in: followeeObjectIds, $nin: excludedAuthorIds },
        kind: { $in: allowedKinds },
        status: 'published',
        visibility: { $ne: 'private' },
        deletedAt: null,
        publishedAt: { $ne: null },
        _id: { $nin: Array.from(hiddenIds, (id) => new Types.ObjectId(id)) },
      })
      .sort({ createdAt: -1 })
      .limit(candidateLimit)
      .lean();

    const merged: Post[] = [];
    const seen = new Set<string>();

    const pushCandidate = (raw: unknown) => {
      const candidate = raw as Post;
      const id = (
        candidate as { _id?: Types.ObjectId | string }
      )?._id?.toString?.();
      if (!id || seen.has(id) || hiddenIds.has(id)) {
        return;
      }
      merged.push(this.postModel.hydrate(candidate) as Post);
      seen.add(id);
    };

    followCandidates.forEach((raw) => pushCandidate(raw));

    const topPosts = merged.slice(sliceStart, sliceEnd);

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

    const repostSourceIds = Array.from(
      new Set(
        topPosts
          .map((p) => p.repostOf?.toString?.())
          .filter((id): id is string => Boolean(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    let repostSourceProfileMap = new Map<
      string,
      (typeof profiles)[number] | null
    >();

    if (repostSourceIds.length) {
      const repostSources = await this.postModel
        .find({ _id: { $in: repostSourceIds }, deletedAt: null })
        .select('authorId')
        .lean();

      const repostAuthorIds = Array.from(
        new Set(
          repostSources
            .map((p) => p.authorId?.toString?.())
            .filter((id): id is string => Boolean(id)),
        ),
      ).map((id) => new Types.ObjectId(id));

      if (repostAuthorIds.length) {
        const repostProfiles = await this.profileModel
          .find({ userId: { $in: repostAuthorIds } })
          .select('userId displayName username avatarUrl')
          .lean();

        repostProfiles.forEach((p) => profileMap.set(p.userId.toString(), p));

        repostSourceProfileMap = new Map(
          repostSources
            .map((src) => {
              const key = src._id?.toString?.();
              if (!key) return null;
              const prof = src.authorId
                ? profileMap.get(src.authorId.toString()) || null
                : null;
              return [key, prof] as [string, (typeof profiles)[number] | null];
            })
            .filter(Boolean) as Array<
            [string, (typeof profiles)[number] | null]
          >,
        );
      }
    }

    const postIds = topPosts.map((p) => p._id);
    const interactions = await this.postInteractionModel
      .find({
        userId: userObjectId,
        postId: { $in: postIds },
        type: { $in: ['like', 'save', 'repost'] },
      })
      .select('postId type')
      .lean();

    const interactionMap = new Map<
      string,
      { liked?: boolean; saved?: boolean; reposted?: boolean }
    >();

    interactions.forEach((item) => {
      const key = item.postId?.toString?.();
      if (!key) return;
      const current = interactionMap.get(key) || {};
      if (item.type === 'like') current.liked = true;
      if (item.type === 'save') current.saved = true;
      if (item.type === 'repost') current.reposted = true;
      interactionMap.set(key, current);
    });

    return topPosts.map((post) => {
      const profile = profileMap.get(post.authorId?.toString?.() ?? '') || null;
      const baseFlags = interactionMap.get(post._id?.toString?.() ?? '') || {};
      const following = post.authorId
        ? followeeSet.has(post.authorId.toString())
        : false;
      const repostProfile = post.repostOf
        ? repostSourceProfileMap.get(post.repostOf.toString()) || null
        : null;
      return this.toResponse(
        post,
        profile,
        { ...baseFlags, following },
        repostProfile,
      );
    });
  }

  async getReelsFeed(userId: string, limit = 20, page = 1) {
    return this.getFeed(userId, limit, ['reel'], page);
  }

  async recordImpression(
    userId: string,
    postId: string,
    opts: { sessionId: string; position?: number | null; source?: string },
  ) {
    const { userObjectId, postObjectId } = await this.resolveIds(
      userId,
      postId,
    );

    await this.assertPostAccessible(userObjectId, postObjectId);

    const source = opts.source?.toString?.() || 'explore';
    const sessionId = opts.sessionId?.toString?.();
    if (!sessionId) {
      throw new BadRequestException('Missing sessionId');
    }

    let created = false;
    try {
      await this.impressionEventModel.create({
        userId: userObjectId,
        postId: postObjectId,
        source,
        sessionId,
        position: typeof opts.position === 'number' ? opts.position : null,
      });
      created = true;
    } catch {
      // Duplicate (userId, postId, sessionId) => ignore
    }

    if (created) {
      await this.bumpCounters(postObjectId, { 'stats.impressions': 1 });
    }

    return { impressed: true, created };
  }

  async getExploreFeed(
    userId: string,
    limit = 30,
    page = 1,
    kinds: PostKind[] = ['post', 'reel'],
  ) {
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const allowedKinds = kinds.length ? kinds : ['post', 'reel'];
    const safeLimit = Math.min(Math.max(limit, 1), 60);
    const safePage = Math.min(Math.max(page || 1, 1), 50);
    const sliceStart = (safePage - 1) * safeLimit;
    const sliceEnd = sliceStart + safeLimit;

    const userObjectId = this.asObjectId(userId, 'userId');

    const hidden = await this.postInteractionModel
      .find({ userId: userObjectId, type: { $in: ['hide', 'report'] } })
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
    const followeeObjectIds = followeeIds.map((id) => new Types.ObjectId(id));

    const { blockedIds, blockedByIds } =
      await this.blocksService.getBlockLists(userObjectId);
    const excludedAuthorIds = Array.from(
      new Set([...blockedIds, ...blockedByIds]),
      (id) => new Types.ObjectId(id),
    );

    const now = new Date();
    const freshnessWindow = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Fixed candidate pool size (stable across pages).
    const candidateLimit = 1000;

    const candidateDocs = await this.postModel
      .find({
        authorId: {
          $nin: [userObjectId, ...followeeObjectIds, ...excludedAuthorIds],
        },
        kind: { $in: allowedKinds },
        status: 'published',
        visibility: 'public',
        deletedAt: null,
        publishedAt: { $ne: null },
        createdAt: { $gte: freshnessWindow },
        _id: { $nin: Array.from(hiddenIds, (id) => new Types.ObjectId(id)) },
      })
      .sort({
        'stats.views': -1,
        'stats.hearts': -1,
        'stats.comments': -1,
        createdAt: -1,
      })
      .limit(candidateLimit)
      .lean();

    if (!candidateDocs.length)
      return [] as ReturnType<typeof this.toResponse>[];

    const taste = await this.getOrRebuildTasteProfile(userObjectId);

    const candidates = candidateDocs.map(
      (raw) => this.postModel.hydrate(raw) as Post,
    );

    const candidateIds = candidates
      .map((p) => p._id?.toString?.())
      .filter((id): id is string => Boolean(id));

    const viewed = await this.postInteractionModel
      .find({
        userId: userObjectId,
        postId: { $in: candidateIds.map((id) => new Types.ObjectId(id)) },
        type: 'view',
      })
      .select('postId')
      .lean();
    const viewedIds = new Set(
      viewed.map((v) => v.postId?.toString?.()).filter(Boolean),
    );

    const scored = candidates
      .map((post) => {
        const base = this.scorePost(post, new Set<string>(), now);
        const interest = this.scoreInterest(post, taste);
        const interestBoost = Math.min(0.6, Math.max(0, interest / 20));
        const score = base * (1 + interestBoost);
        const viewed = post._id ? viewedIds.has(post._id.toString()) : false;
        return { post, score, viewed };
      })
      .sort((a, b) => {
        const byScore = b.score - a.score;
        if (byScore) return byScore;
        const aCreated = a.post.createdAt
          ? new Date(a.post.createdAt).getTime()
          : 0;
        const bCreated = b.post.createdAt
          ? new Date(b.post.createdAt).getTime()
          : 0;
        if (aCreated !== bCreated) return bCreated - aCreated;
        return (b.post._id?.toString?.() ?? '').localeCompare(
          a.post._id?.toString?.() ?? '',
        );
      });

    const prioritized = [
      ...scored.filter((x) => !x.viewed),
      ...scored.filter((x) => x.viewed),
    ];

    // Diversity: cap items per author so Explore doesn't spam one creator.
    const picked: Post[] = [];
    const authorCounts = new Map<string, number>();
    const maxPerAuthor = 2;

    for (const item of prioritized) {
      const authorKey = item.post.authorId?.toString?.() ?? '';
      const count = authorCounts.get(authorKey) ?? 0;
      if (authorKey && count >= maxPerAuthor) continue;
      picked.push(item.post);
      if (authorKey) authorCounts.set(authorKey, count + 1);
      if (picked.length >= sliceEnd) break;
    }

    const pagePosts = picked.slice(sliceStart, sliceEnd);
    if (!pagePosts.length) return [] as ReturnType<typeof this.toResponse>[];

    const authorIds = Array.from(
      new Set(
        pagePosts
          .map((p) => p.authorId?.toString?.())
          .filter((id): id is string => Boolean(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const profiles = await this.profileModel
      .find({ userId: { $in: authorIds } })
      .select('userId displayName username avatarUrl')
      .lean();
    const profileMap = new Map(profiles.map((p) => [p.userId.toString(), p]));

    const postIds = pagePosts.map((p) => p._id);
    const interactions = await this.postInteractionModel
      .find({
        userId: userObjectId,
        postId: { $in: postIds },
        type: { $in: ['like', 'save', 'repost'] },
      })
      .select('postId type')
      .lean();

    const interactionMap = new Map<
      string,
      { liked?: boolean; saved?: boolean; reposted?: boolean }
    >();

    interactions.forEach((item) => {
      const key = item.postId?.toString?.();
      if (!key) return;
      const current = interactionMap.get(key) || {};
      if (item.type === 'like') current.liked = true;
      if (item.type === 'save') current.saved = true;
      if (item.type === 'repost') current.reposted = true;
      interactionMap.set(key, current);
    });

    return pagePosts.map((post) => {
      const profile = profileMap.get(post.authorId?.toString?.() ?? '') || null;
      const baseFlags = interactionMap.get(post._id?.toString?.() ?? '') || {};
      return this.toResponse(post, profile, baseFlags);
    });
  }

  private async getOrRebuildTasteProfile(userObjectId: Types.ObjectId) {
    const existing = await this.tasteProfileModel
      .findOne({ userId: userObjectId })
      .lean();

    const now = Date.now();
    const updatedAt = existing?.updatedAt
      ? new Date(existing.updatedAt).getTime()
      : 0;
    const stale = !updatedAt || now - updatedAt > 6 * 60 * 60 * 1000;

    if (existing && !stale) {
      return this.tasteProfileModel.hydrate(existing) as UserTasteProfile;
    }

    const rebuilt = await this.rebuildTasteProfile(userObjectId);

    await this.tasteProfileModel
      .updateOne(
        { userId: userObjectId },
        {
          $set: {
            hashtagWeights: rebuilt.hashtagWeights,
            topicWeights: rebuilt.topicWeights,
            authorWeights: rebuilt.authorWeights,
            kindWeights: rebuilt.kindWeights,
            version: 3,
          },
        },
        { upsert: true },
      )
      .exec();

    const fresh = await this.tasteProfileModel
      .findOne({ userId: userObjectId })
      .lean();
    return fresh
      ? (this.tasteProfileModel.hydrate(fresh) as UserTasteProfile)
      : rebuilt;
  }

  private async rebuildTasteProfile(userObjectId: Types.ObjectId) {
    const windowDays = 30;
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const interactions = await this.postInteractionModel
      .find({
        userId: userObjectId,
        type: { $in: ['like', 'save', 'repost', 'share', 'view'] },
        createdAt: { $gte: since },
      })
      .select('postId type durationMs createdAt')
      .sort({ createdAt: -1 })
      .limit(2000)
      .lean();

    const postIds = Array.from(
      new Set(
        interactions
          .map((it) => it.postId?.toString?.())
          .filter((id): id is string => Boolean(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const posts = await this.postModel
      .find({ _id: { $in: postIds }, deletedAt: null })
      .select('authorId hashtags topics kind primaryVideoDurationMs createdAt')
      .lean();
    const postMap = new Map(posts.map((p) => [p._id.toString(), p]));

    const hashtagWeights = new Map<string, number>();
    const topicWeights = new Map<string, number>();
    const authorWeights = new Map<string, number>();
    const kindWeights = new Map<string, number>();

    const bump = (m: Map<string, number>, key: string, delta: number) => {
      if (!key) return;
      m.set(key, (m.get(key) ?? 0) + delta);
    };

    for (const it of interactions) {
      const postId = it.postId?.toString?.();
      if (!postId) continue;
      const post = postMap.get(postId);
      if (!post) continue;

      const ageDays = Math.max(
        0,
        (Date.now() - new Date(it.createdAt).getTime()) / (24 * 60 * 60 * 1000),
      );
      const decay = Math.exp(-ageDays / 14);

      let base = 0;
      if (it.type === 'save') base = 5;
      else if (it.type === 'like') base = 3;
      else if (it.type === 'repost') base = 4;
      else if (it.type === 'share') base = 3;
      else if (it.type === 'view') {
        const watchedMs = typeof it.durationMs === 'number' ? it.durationMs : 0;
        const denom =
          typeof (post as { primaryVideoDurationMs?: unknown })
            .primaryVideoDurationMs === 'number'
            ? (post as { primaryVideoDurationMs: number })
                .primaryVideoDurationMs
            : 8000;
        const completion = denom > 0 ? watchedMs / denom : 0;
        base = Math.min(2.5, Math.max(0, completion * 2));
      }

      const w = base * decay;
      if (w <= 0) continue;

      const authorId = (post as { authorId?: Types.ObjectId | null }).authorId;
      if (authorId) bump(authorWeights, authorId.toString(), w);

      const kind = (post as { kind?: string | null }).kind;
      if (kind) bump(kindWeights, kind, w);

      const hashtags = (post as { hashtags?: string[] | null }).hashtags ?? [];
      hashtags.slice(0, 8).forEach((tag) => bump(hashtagWeights, tag, w));

      const topics = (post as { topics?: string[] | null }).topics ?? [];
      topics.slice(0, 6).forEach((t) => bump(topicWeights, t, w));
    }

    const takeTop = (m: Map<string, number>, max: number) => {
      const entries = Array.from(m.entries())
        .filter(([, v]) => Number.isFinite(v) && v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, max);
      return new Map(entries);
    };

    return {
      userId: userObjectId as any,
      hashtagWeights: takeTop(hashtagWeights, 120),
      topicWeights: takeTop(topicWeights, 120),
      authorWeights: takeTop(authorWeights, 200),
      kindWeights: takeTop(kindWeights, 10),
      version: 3,
    } as UserTasteProfile;
  }

  private scoreInterest(post: Post, taste: UserTasteProfile | null) {
    if (!taste) return 0;
    const hashtagWeights = taste.hashtagWeights ?? new Map();
    const topicWeights = taste.topicWeights ?? new Map();
    const authorWeights = taste.authorWeights ?? new Map();
    const kindWeights = taste.kindWeights ?? new Map();

    let score = 0;

    const authorId = post.authorId?.toString?.() ?? '';
    if (authorId) score += Number(authorWeights.get(authorId) ?? 0) * 1.2;

    const kind = (post as { kind?: string | null }).kind ?? '';
    if (kind) score += Number(kindWeights.get(kind) ?? 0) * 0.4;

    (post.hashtags ?? []).slice(0, 8).forEach((tag) => {
      score += Number(hashtagWeights.get(tag) ?? 0);
    });
    (post.topics ?? []).slice(0, 6).forEach((t) => {
      score += Number(topicWeights.get(t) ?? 0);
    });

    return score;
  }

  async getPostsByHashtag(params: {
    viewerId: string;
    tag: string;
    limit?: number;
    page?: number;
  }) {
    const { viewerId, tag } = params;
    const safeLimit = Math.min(Math.max(params.limit ?? 30, 1), 60);
    const safePage = Math.min(Math.max(params.page ?? 1, 1), 50);
    const sliceStart = (safePage - 1) * safeLimit;
    const sliceEnd = sliceStart + safeLimit;
    const candidateLimit = Math.min(safeLimit * 3 * safePage, 600);

    const normalizedTag = this.normalizeHashtags([tag])[0];
    if (!normalizedTag) {
      throw new BadRequestException('Invalid hashtag');
    }

    const viewerObjectId = this.asObjectId(viewerId, 'viewerId');

    const hidden = await this.postInteractionModel
      .find({ userId: viewerObjectId, type: { $in: ['hide', 'report'] } })
      .select('postId')
      .lean();
    const hiddenIds = new Set(
      hidden.map((h) => h.postId?.toString?.()).filter(Boolean),
    );

    const followees = await this.followModel
      .find({ followerId: viewerObjectId })
      .select('followeeId')
      .lean();
    const followeeIds = followees.map((f) => f.followeeId.toString());
    const followeeSet = new Set(followeeIds);
    const followeeObjectIds = followeeIds.map((id) => new Types.ObjectId(id));

    const { blockedIds, blockedByIds } =
      await this.blocksService.getBlockLists(viewerObjectId);
    const excludedAuthorIds = Array.from(
      new Set([...blockedIds, ...blockedByIds]),
      (id) => new Types.ObjectId(id),
    );

    const posts = await this.postModel
      .find({
        hashtags: normalizedTag,
        kind: 'post',
        status: 'published',
        deletedAt: null,
        publishedAt: { $ne: null },
        authorId: { $nin: excludedAuthorIds },
        _id: { $nin: Array.from(hiddenIds, (id) => new Types.ObjectId(id)) },
        $or: [
          { authorId: viewerObjectId },
          { visibility: 'public' },
          {
            visibility: 'followers',
            authorId: { $in: followeeObjectIds },
          },
        ],
      })
      .sort({ createdAt: -1 })
      .limit(candidateLimit)
      .lean();

    if (!posts.length) return [] as ReturnType<typeof this.toResponse>[];

    const now = new Date();
    const ranked = posts
      .map((raw) => this.postModel.hydrate(raw) as Post)
      .map((post) => ({ post, score: this.scorePost(post, followeeSet, now) }))
      .sort((a, b) => {
        const byScore = b.score - a.score;
        if (byScore) return byScore;
        const aCreated = a.post.createdAt
          ? new Date(a.post.createdAt).getTime()
          : 0;
        const bCreated = b.post.createdAt
          ? new Date(b.post.createdAt).getTime()
          : 0;
        if (aCreated !== bCreated) return bCreated - aCreated;
        return (b.post._id?.toString?.() ?? '').localeCompare(
          a.post._id?.toString?.() ?? '',
        );
      });

    const pagePosts = ranked.slice(sliceStart, sliceEnd).map((x) => x.post);
    if (!pagePosts.length) return [] as ReturnType<typeof this.toResponse>[];

    const authorIds = Array.from(
      new Set(
        pagePosts
          .map((p) => p.authorId?.toString?.())
          .filter((id): id is string => Boolean(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const profiles = await this.profileModel
      .find({ userId: { $in: authorIds } })
      .select('userId displayName username avatarUrl')
      .lean();

    const profileMap = new Map(profiles.map((p) => [p.userId.toString(), p]));

    const postIds = pagePosts.map((p) => p._id);
    const interactions = await this.postInteractionModel
      .find({
        userId: viewerObjectId,
        postId: { $in: postIds },
        type: { $in: ['like', 'save', 'repost'] },
      })
      .select('postId type')
      .lean();

    const interactionMap = new Map<
      string,
      { liked?: boolean; saved?: boolean; reposted?: boolean }
    >();

    interactions.forEach((item) => {
      const key = item.postId?.toString?.();
      if (!key) return;
      const current = interactionMap.get(key) || {};
      if (item.type === 'like') current.liked = true;
      if (item.type === 'save') current.saved = true;
      if (item.type === 'repost') current.reposted = true;
      interactionMap.set(key, current);
    });

    return pagePosts.map((post) => {
      const profile = profileMap.get(post.authorId?.toString?.() ?? '') || null;
      const baseFlags = interactionMap.get(post._id?.toString?.() ?? '') || {};
      const following = post.authorId
        ? followeeSet.has(post.authorId.toString())
        : false;
      return this.toResponse(post, profile, { ...baseFlags, following });
    });
  }

  async getReelsByHashtag(params: {
    viewerId: string;
    tag: string;
    limit?: number;
    page?: number;
  }) {
    const { viewerId, tag } = params;
    const safeLimit = Math.min(Math.max(params.limit ?? 30, 1), 60);
    const safePage = Math.min(Math.max(params.page ?? 1, 1), 50);
    const sliceStart = (safePage - 1) * safeLimit;
    const sliceEnd = sliceStart + safeLimit;
    const candidateLimit = Math.min(safeLimit * 3 * safePage, 600);

    const normalizedTag = this.normalizeHashtags([tag])[0];
    if (!normalizedTag) {
      throw new BadRequestException('Invalid hashtag');
    }

    const viewerObjectId = this.asObjectId(viewerId, 'viewerId');

    const hidden = await this.postInteractionModel
      .find({ userId: viewerObjectId, type: { $in: ['hide', 'report'] } })
      .select('postId')
      .lean();
    const hiddenIds = new Set(
      hidden.map((h) => h.postId?.toString?.()).filter(Boolean),
    );

    const followees = await this.followModel
      .find({ followerId: viewerObjectId })
      .select('followeeId')
      .lean();
    const followeeIds = followees.map((f) => f.followeeId.toString());
    const followeeSet = new Set(followeeIds);
    const followeeObjectIds = followeeIds.map((id) => new Types.ObjectId(id));

    const { blockedIds, blockedByIds } =
      await this.blocksService.getBlockLists(viewerObjectId);
    const excludedAuthorIds = Array.from(
      new Set([...blockedIds, ...blockedByIds]),
      (id) => new Types.ObjectId(id),
    );

    const posts = await this.postModel
      .find({
        hashtags: normalizedTag,
        kind: 'reel',
        status: 'published',
        deletedAt: null,
        publishedAt: { $ne: null },
        authorId: { $nin: excludedAuthorIds },
        _id: { $nin: Array.from(hiddenIds, (id) => new Types.ObjectId(id)) },
        $or: [
          { authorId: viewerObjectId },
          { visibility: 'public' },
          {
            visibility: 'followers',
            authorId: { $in: followeeObjectIds },
          },
        ],
      })
      .sort({ createdAt: -1 })
      .limit(candidateLimit)
      .lean();

    if (!posts.length) return [] as ReturnType<typeof this.toResponse>[];

    const now = new Date();
    const ranked = posts
      .map((raw) => this.postModel.hydrate(raw) as Post)
      .map((post) => ({ post, score: this.scorePost(post, followeeSet, now) }))
      .sort((a, b) => {
        const byScore = b.score - a.score;
        if (byScore) return byScore;
        const aCreated = a.post.createdAt
          ? new Date(a.post.createdAt).getTime()
          : 0;
        const bCreated = b.post.createdAt
          ? new Date(b.post.createdAt).getTime()
          : 0;
        if (aCreated !== bCreated) return bCreated - aCreated;
        return (b.post._id?.toString?.() ?? '').localeCompare(
          a.post._id?.toString?.() ?? '',
        );
      });

    const pageReels = ranked.slice(sliceStart, sliceEnd).map((x) => x.post);
    if (!pageReels.length) return [] as ReturnType<typeof this.toResponse>[];

    const authorIds = Array.from(
      new Set(
        pageReels
          .map((p) => p.authorId?.toString?.())
          .filter((id): id is string => Boolean(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const profiles = await this.profileModel
      .find({ userId: { $in: authorIds } })
      .select('userId displayName username avatarUrl')
      .lean();

    const profileMap = new Map(profiles.map((p) => [p.userId.toString(), p]));

    const postIds = pageReels.map((p) => p._id);
    const interactions = await this.postInteractionModel
      .find({
        userId: viewerObjectId,
        postId: { $in: postIds },
        type: { $in: ['like', 'save', 'repost'] },
      })
      .select('postId type')
      .lean();

    const interactionMap = new Map<
      string,
      { liked?: boolean; saved?: boolean; reposted?: boolean }
    >();

    interactions.forEach((item) => {
      const key = item.postId?.toString?.();
      if (!key) return;
      const current = interactionMap.get(key) || {};
      if (item.type === 'like') current.liked = true;
      if (item.type === 'save') current.saved = true;
      if (item.type === 'repost') current.reposted = true;
      interactionMap.set(key, current);
    });

    return pageReels.map((post) => {
      const profile = profileMap.get(post.authorId?.toString?.() ?? '') || null;
      const baseFlags = interactionMap.get(post._id?.toString?.() ?? '') || {};
      const following = post.authorId
        ? followeeSet.has(post.authorId.toString())
        : false;
      return this.toResponse(post, profile, { ...baseFlags, following });
    });
  }

  async getUserPosts(params: {
    viewerId: string;
    targetUserId: string;
    limit?: number;
  }) {
    const { viewerId, targetUserId } = params;
    const limit = Math.min(Math.max(params.limit ?? 24, 1), 60);

    const viewerObjectId = this.asObjectId(viewerId, 'viewerId');
    const targetObjectId = this.asObjectId(targetUserId, 'targetUserId');

    if (viewerObjectId.toString() !== targetObjectId.toString()) {
      await this.blocksService.assertNotBlocked(viewerObjectId, targetObjectId);
    }

    const isOwner = viewerObjectId.equals(targetObjectId);
    let allowedVisibilities: Visibility[] = ['public'];

    if (isOwner) {
      allowedVisibilities = ['public', 'followers', 'private'];
    } else {
      const follows = await this.followModel
        .findOne({ followerId: viewerObjectId, followeeId: targetObjectId })
        .select('_id')
        .lean();
      if (follows?._id) {
        allowedVisibilities = ['public', 'followers'];
      }
    }

    const docs = await this.postModel
      .find({
        authorId: targetObjectId,
        kind: 'post',
        status: 'published',
        visibility: { $in: allowedVisibilities },
        deletedAt: null,
        publishedAt: { $ne: null },
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return docs.map((doc) =>
      this.toResponse(this.postModel.hydrate(doc) as Post),
    );
  }

  async getUserReels(params: {
    viewerId: string;
    targetUserId: string;
    limit?: number;
  }) {
    const { viewerId, targetUserId } = params;
    const limit = Math.min(Math.max(params.limit ?? 24, 1), 60);

    const viewerObjectId = this.asObjectId(viewerId, 'viewerId');
    const targetObjectId = this.asObjectId(targetUserId, 'targetUserId');

    if (viewerObjectId.toString() !== targetObjectId.toString()) {
      await this.blocksService.assertNotBlocked(viewerObjectId, targetObjectId);
    }

    const isOwner = viewerObjectId.equals(targetObjectId);
    let allowedVisibilities: Visibility[] = ['public'];

    if (isOwner) {
      allowedVisibilities = ['public', 'followers', 'private'];
    } else {
      const follows = await this.followModel
        .findOne({ followerId: viewerObjectId, followeeId: targetObjectId })
        .select('_id')
        .lean();
      if (follows?._id) {
        allowedVisibilities = ['public', 'followers'];
      }
    }

    const docs = await this.postModel
      .find({
        authorId: targetObjectId,
        kind: 'reel',
        status: 'published',
        visibility: { $in: allowedVisibilities },
        deletedAt: null,
        publishedAt: { $ne: null },
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return docs.map((doc) =>
      this.toResponse(this.postModel.hydrate(doc) as Post),
    );
  }

  async getSavedPosts(userId: string, limit = 24) {
    const viewerObjectId = this.asObjectId(userId, 'userId');
    const safeLimit = Math.min(Math.max(limit, 1), 60);

    const saves = await this.postInteractionModel
      .find({ userId: viewerObjectId, type: 'save' })
      .sort({ createdAt: -1 })
      .limit(safeLimit * 3)
      .lean();

    const postIds = Array.from(
      new Set(
        saves
          .map((s) => s.postId)
          .filter((id): id is Types.ObjectId => Boolean(id)),
      ),
    );

    if (!postIds.length) return [] as ReturnType<typeof this.toResponse>[];

    const posts = await this.postModel
      .find({
        _id: { $in: postIds },
        status: 'published',
        deletedAt: null,
        publishedAt: { $ne: null },
      })
      .lean();

    const filtered: Post[] = [];

    for (const raw of posts) {
      const doc = this.postModel.hydrate(raw) as Post;

      try {
        await this.blocksService.assertNotBlocked(viewerObjectId, doc.authorId);
      } catch {
        continue;
      }

      const isOwner = doc.authorId?.equals(viewerObjectId) ?? false;

      if (!isOwner) {
        if (doc.visibility === 'private') continue;
        if (doc.visibility === 'followers') {
          const follows = await this.followModel
            .findOne({ followerId: viewerObjectId, followeeId: doc.authorId })
            .select('_id')
            .lean();

          if (!follows?._id) continue;
        }
      }

      filtered.push(doc);
    }

    if (!filtered.length) return [] as ReturnType<typeof this.toResponse>[];

    filtered.sort(
      (a, b) =>
        (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0),
    );

    const limited = filtered.slice(0, safeLimit);

    const authorIds = Array.from(
      new Set(
        limited
          .map((p) => p.authorId?.toString?.())
          .filter((id): id is string => Boolean(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const profiles = await this.profileModel
      .find({ userId: { $in: authorIds } })
      .select('userId displayName username avatarUrl')
      .lean();

    const profileMap = new Map(profiles.map((p) => [p.userId.toString(), p]));

    return limited.map((post) => {
      const profile = profileMap.get(post.authorId?.toString?.() ?? '') || null;
      return this.toResponse(post, profile, { saved: true });
    });
  }

  async getSavedReels(userId: string, limit = 24) {
    const viewerObjectId = this.asObjectId(userId, 'userId');
    const safeLimit = Math.min(Math.max(limit, 1), 60);

    const saves = await this.postInteractionModel
      .find({ userId: viewerObjectId, type: 'save' })
      .sort({ createdAt: -1 })
      .limit(safeLimit * 2)
      .lean();

    const postIds = saves
      .map((s) => s.postId)
      .filter((id): id is Types.ObjectId => Boolean(id));

    if (!postIds.length) return [] as ReturnType<typeof this.toResponse>[];

    const posts = await this.postModel
      .find({
        _id: { $in: postIds },
        kind: 'reel',
        status: 'published',
        deletedAt: null,
        publishedAt: { $ne: null },
      })
      .lean();

    const postMap = new Map(
      posts.map((p) => [p._id?.toString?.() ?? '', this.postModel.hydrate(p)]),
    );

    const results: Post[] = [];

    for (const interaction of saves) {
      if (results.length >= safeLimit) break;
      const postId = interaction.postId?.toString?.();
      if (!postId) continue;
      const doc = postMap.get(postId);
      if (!doc) continue;

      try {
        await this.blocksService.assertNotBlocked(viewerObjectId, doc.authorId);
      } catch {
        continue;
      }

      const isOwner = doc.authorId?.equals(viewerObjectId) ?? false;
      if (!isOwner) {
        if (doc.visibility === 'private') continue;
        if (doc.visibility === 'followers') {
          const follows = await this.followModel
            .findOne({ followerId: viewerObjectId, followeeId: doc.authorId })
            .select('_id')
            .lean();
          if (!follows?._id) continue;
        }
      }

      results.push(doc as Post);
    }

    if (!results.length) return [] as ReturnType<typeof this.toResponse>[];

    const authorIds = Array.from(
      new Set(
        results
          .map((p) => p.authorId?.toString?.())
          .filter((id): id is string => Boolean(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const profiles = await this.profileModel
      .find({ userId: { $in: authorIds } })
      .select('userId displayName username avatarUrl')
      .lean();

    const profileMap = new Map(profiles.map((p) => [p.userId.toString(), p]));

    return results.map((post) => {
      const profile = profileMap.get(post.authorId?.toString?.() ?? '') || null;
      return this.toResponse(post, profile, { saved: true });
    });
  }

  async getById(
    userId: string,
    postId: string,
    opts?: { allowedKinds?: PostKind[] },
  ) {
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

    if (
      opts?.allowedKinds &&
      opts.allowedKinds.length &&
      !opts.allowedKinds.includes(post.kind)
    ) {
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
        type: { $in: ['like', 'save', 'repost'] },
      })
      .select('type')
      .lean();

    const flags = interactions.reduce<{
      liked?: boolean;
      saved?: boolean;
      following?: boolean;
      reposted?: boolean;
    }>((acc, item) => {
      if (item.type === 'like') acc.liked = true;
      if (item.type === 'save') acc.saved = true;
      if (item.type === 'repost') acc.reposted = true;
      return acc;
    }, {});

    if (!isAuthor) {
      const isFollowing = await this.followModel
        .findOne({ followerId: userObjectId, followeeId: post.authorId })
        .select('_id')
        .lean();
      flags.following = Boolean(isFollowing);
    }

    return this.toResponse(
      this.postModel.hydrate(post) as Post,
      profile || null,
      flags,
    );
  }

  async getReelById(userId: string, postId: string) {
    return this.getById(userId, postId, { allowedKinds: ['reel'] });
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

  async repost(userId: string, postId: string) {
    const { postObjectId, userObjectId } = await this.resolveIds(
      userId,
      postId,
    );
    await this.assertPostAccessible(userObjectId, postObjectId);

    const inserted = await this.upsertUniqueInteraction(
      userObjectId,
      postObjectId,
      'repost',
      true,
    );

    if (inserted) {
      await this.bumpCounters(postObjectId, { 'stats.reposts': 1 });
    }

    return { reposted: true, created: inserted };
  }

  async unrepost(userId: string, postId: string) {
    const { postObjectId, userObjectId } = await this.resolveIds(
      userId,
      postId,
    );
    await this.assertPostAccessible(userObjectId, postObjectId);

    const removed = await this.removeUniqueInteraction(
      userObjectId,
      postObjectId,
      'repost',
      true,
    );

    if (removed) {
      await this.bumpCounters(postObjectId, { 'stats.reposts': -1 });
    }

    return { reposted: !removed };
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

  async setAllowComments(userId: string, postId: string, allow: boolean) {
    const { userObjectId, postObjectId } = await this.resolveIds(
      userId,
      postId,
    );

    const post = await this.postModel
      .findOne({ _id: postObjectId, deletedAt: null })
      .select('authorId allowComments')
      .lean();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (
      !post.authorId ||
      post.authorId.toString() !== userObjectId.toString()
    ) {
      throw new ForbiddenException(
        'Only the author can change comment settings',
      );
    }

    await this.postModel
      .updateOne({ _id: postObjectId }, { $set: { allowComments: allow } })
      .exec();

    return { allowComments: allow };
  }

  async setHideLikeCount(userId: string, postId: string, hide: boolean) {
    const { userObjectId, postObjectId } = await this.resolveIds(
      userId,
      postId,
    );

    const post = await this.postModel
      .findOne({ _id: postObjectId, deletedAt: null })
      .select('authorId hideLikeCount')
      .lean();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (
      !post.authorId ||
      post.authorId.toString() !== userObjectId.toString()
    ) {
      throw new ForbiddenException(
        'Only the author can change like visibility',
      );
    }

    await this.postModel
      .updateOne({ _id: postObjectId }, { $set: { hideLikeCount: hide } })
      .exec();

    return { hideLikeCount: hide };
  }

  async setVisibility(
    userId: string,
    postId: string,
    visibility: 'public' | 'followers' | 'private',
  ) {
    const { userObjectId, postObjectId } = await this.resolveIds(
      userId,
      postId,
    );

    const post = await this.postModel
      .findOne({ _id: postObjectId, deletedAt: null })
      .select('authorId visibility')
      .lean();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (!post.authorId || !post.authorId.equals(userObjectId)) {
      throw new ForbiddenException('Only the author can change visibility');
    }

    if (post.visibility === visibility) {
      return { visibility, unchanged: true };
    }

    await this.postModel
      .updateOne({ _id: postObjectId }, { $set: { visibility } })
      .exec();

    return { visibility, updated: true };
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

    const upserted =
      Boolean((result as { upsertedCount?: number }).upsertedCount) ||
      Boolean((result as { upsertedId?: unknown }).upsertedId) ||
      (result.matchedCount === 0 && result.modifiedCount === 0);

    return upserted;
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
