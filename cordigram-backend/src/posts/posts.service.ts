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
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityLogService } from '../activity/activity.service';
import { PostSchedulerService } from './post-scheduler.service';
import { User } from '../users/user.schema';
import {
  MediaModerationService,
  type ImageModerationResult,
} from './media-moderation.service';
import { ModerationAction } from '../moderation/moderation-action.schema';
import { PaymentTransaction } from '../payments/payment-transaction.schema';
import { ReportPost } from '../reportpost/reportpost.schema';
import { AdEngagementEvent } from '../payments/ad-engagement-event.schema';
import { UsersService } from '../users/users.service';
type UploadedFile = {
  buffer: Buffer;
  mimetype: string;
  size?: number;
  originalname?: string;
};

const REEL_MAX_DURATION_SECONDS = 90;
const SPONSORED_REPUTATION_WINDOW_DAYS = 30;
const ADS_FREQUENCY_COOLDOWN_MINUTES = 30;
const ADS_FREQUENCY_MAX_IMPRESSIONS_24H = 3;
const REACH_RESTRICT_SCORE_MULTIPLIER = 0.15;

@Injectable()
export class PostsService {
  private mapProfilesByUserId<
    T extends { userId?: Types.ObjectId; isCreatorVerified?: boolean },
  >(profiles: T[]) {
    const profileMap = new Map<string, T>();
    profiles.forEach((profile) => {
      const id = profile.userId?.toString?.();
      if (!id) return;
      profileMap.set(id, profile);
    });
    return profileMap;
  }

  private async getProfilesWithCreatorVerification(userIds: Types.ObjectId[]) {
    if (!userIds.length)
      return [] as Array<{
        userId?: Types.ObjectId;
        displayName?: string;
        username?: string;
        avatarUrl?: string;
        isCreatorVerified?: boolean;
      }>;

    const profiles = await this.profileModel
      .find({ userId: { $in: userIds } })
      .select('userId displayName username avatarUrl')
      .lean();

    const users = await this.userModel
      .find({ _id: { $in: userIds } })
      .select('_id isCreatorVerified')
      .lean();

    const verifiedMap = new Map<string, boolean>();
    users.forEach((user) => {
      const id = user._id?.toString?.();
      if (!id) return;
      verifiedMap.set(id, Boolean(user.isCreatorVerified));
    });

    return profiles.map((profile) => ({
      ...profile,
      isCreatorVerified:
        verifiedMap.get(profile.userId?.toString?.() ?? '') ?? false,
    }));
  }

  private readonly sponsoredDurationDaysByPackage: Record<string, number> = {
    d3: 3,
    d7: 7,
    d14: 14,
    d30: 30,
  };

  private readonly sponsoredBoostWeightByPackage: Record<string, number> = {
    light: 0.15,
    standard: 0.3,
    strong: 0.6,
  };

  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(ModerationAction.name)
    private readonly moderationActionModel: Model<ModerationAction>,
    @InjectModel(PostInteraction.name)
    private readonly postInteractionModel: Model<PostInteraction>,
    @InjectModel(Follow.name) private readonly followModel: Model<Follow>,
    @InjectModel(Profile.name) private readonly profileModel: Model<Profile>,
    @InjectModel(Hashtag.name) private readonly hashtagModel: Model<Hashtag>,
    @InjectModel(UserTasteProfile.name)
    private readonly tasteProfileModel: Model<UserTasteProfile>,
    @InjectModel(PostImpressionEvent.name)
    private readonly impressionEventModel: Model<PostImpressionEvent>,
    @InjectModel(PaymentTransaction.name)
    private readonly paymentTransactionModel: Model<PaymentTransaction>,
    @InjectModel(ReportPost.name)
    private readonly reportPostModel: Model<ReportPost>,
    @InjectModel(AdEngagementEvent.name)
    private readonly adEngagementEventModel: Model<AdEngagementEvent>,
    private readonly blocksService: BlocksService,
    private readonly cloudinary: CloudinaryService,
    private readonly config: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly activityLogService: ActivityLogService,
    private readonly postScheduler: PostSchedulerService,
    private readonly mediaModerationService: MediaModerationService,
    private readonly usersService: UsersService,
  ) {}

  private normalizeSponsoredAuthorReputation(params: {
    strikeCount?: number | null;
    accountLimitedUntil?: Date | null;
    accountLimitedIndefinitely?: boolean | null;
    suspendedUntil?: Date | null;
    suspendedIndefinitely?: boolean | null;
    status?: string | null;
    reportsOpen30d?: number;
    reportsTotal30d?: number;
    now: Date;
  }) {
    const {
      strikeCount,
      accountLimitedUntil,
      accountLimitedIndefinitely,
      suspendedUntil,
      suspendedIndefinitely,
      status,
      reportsOpen30d = 0,
      reportsTotal30d = 0,
      now,
    } = params;

    const nowMs = now.getTime();
    const activeLimited =
      Boolean(accountLimitedIndefinitely) ||
      Boolean(accountLimitedUntil && accountLimitedUntil.getTime() > nowMs);
    const activeSuspended =
      Boolean(suspendedIndefinitely) ||
      Boolean(suspendedUntil && suspendedUntil.getTime() > nowMs) ||
      status === 'banned';

    // 0..1 scale: higher is more trusted.
    let trust = 1;
    trust -= Math.min(0.55, Math.max(0, Number(strikeCount ?? 0)) * 0.08);
    if (activeLimited) trust -= 0.22;
    if (activeSuspended) trust -= 0.35;

    const reportPenalty = Math.min(
      0.35,
      reportsOpen30d * 0.03 + reportsTotal30d * 0.008,
    );
    trust -= reportPenalty;

    return Math.max(0, Math.min(1, trust));
  }

  private async buildSponsoredRankingSignals(
    posts: Post[],
    sponsoredBoostByPostId: Map<string, number>,
    now: Date,
  ) {
    const sponsoredPosts = posts.filter((post) =>
      sponsoredBoostByPostId.has(post._id?.toString?.() ?? ''),
    );

    const creatorVerifiedByAuthorId = new Map<string, boolean>();
    const reputationByAuthorId = new Map<string, number>();

    if (!sponsoredPosts.length) {
      return { creatorVerifiedByAuthorId, reputationByAuthorId };
    }

    const sponsoredPostIds = sponsoredPosts
      .map((post) => post._id)
      .filter((id): id is Types.ObjectId => Boolean(id));

    const sponsoredAuthorIds = Array.from(
      new Set(
        sponsoredPosts
          .map((post) => post.authorId?.toString?.())
          .filter((id): id is string => Boolean(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    if (!sponsoredAuthorIds.length) {
      return { creatorVerifiedByAuthorId, reputationByAuthorId };
    }

    const users = await this.userModel
      .find({ _id: { $in: sponsoredAuthorIds } })
      .select(
        '_id isCreatorVerified strikeCount accountLimitedUntil accountLimitedIndefinitely suspendedUntil suspendedIndefinitely status',
      )
      .lean();

    const reportWindowStart = new Date(
      now.getTime() - SPONSORED_REPUTATION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const reportRows = sponsoredPostIds.length
      ? await this.reportPostModel
          .aggregate<{
            _id: Types.ObjectId;
            totalReports: number;
            openReports: number;
          }>([
            {
              $match: {
                postId: { $in: sponsoredPostIds },
                createdAt: { $gte: reportWindowStart },
              },
            },
            {
              $group: {
                _id: '$postId',
                totalReports: { $sum: 1 },
                openReports: {
                  $sum: {
                    $cond: [{ $eq: ['$status', 'open'] }, 1, 0],
                  },
                },
              },
            },
          ])
          .exec()
      : [];

    const reportByPostId = new Map<
      string,
      { totalReports: number; openReports: number }
    >();
    reportRows.forEach((item) => {
      const postId = item._id?.toString?.();
      if (!postId) return;
      reportByPostId.set(postId, {
        totalReports: Math.max(0, Number(item.totalReports ?? 0)),
        openReports: Math.max(0, Number(item.openReports ?? 0)),
      });
    });

    const reportByAuthorId = new Map<
      string,
      { totalReports: number; openReports: number }
    >();
    sponsoredPosts.forEach((post) => {
      const postId = post._id?.toString?.();
      const authorId = post.authorId?.toString?.();
      if (!postId || !authorId) return;
      const report = reportByPostId.get(postId);
      const current = reportByAuthorId.get(authorId) ?? {
        totalReports: 0,
        openReports: 0,
      };
      reportByAuthorId.set(authorId, {
        totalReports: current.totalReports + (report?.totalReports ?? 0),
        openReports: current.openReports + (report?.openReports ?? 0),
      });
    });

    users.forEach((user) => {
      const authorId = user._id?.toString?.();
      if (!authorId) return;

      creatorVerifiedByAuthorId.set(authorId, Boolean(user.isCreatorVerified));

      const reportStats = reportByAuthorId.get(authorId);
      const trust = this.normalizeSponsoredAuthorReputation({
        strikeCount: user.strikeCount,
        accountLimitedUntil: user.accountLimitedUntil,
        accountLimitedIndefinitely: user.accountLimitedIndefinitely,
        suspendedUntil: user.suspendedUntil,
        suspendedIndefinitely: user.suspendedIndefinitely,
        status: user.status,
        reportsOpen30d: reportStats?.openReports ?? 0,
        reportsTotal30d: reportStats?.totalReports ?? 0,
        now,
      });
      reputationByAuthorId.set(authorId, trust);
    });

    return { creatorVerifiedByAuthorId, reputationByAuthorId };
  }

  async create(authorId: string, dto: CreatePostDto) {
    await this.assertInteractionNotMuted(authorId);

    const normalizedHashtags = this.normalizeHashtags(dto.hashtags ?? []);
    const normalizedMentions = this.normalizeMentions(
      dto.mentions ?? [],
      dto.content,
    );
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
        .findOne({ _id: repostOf, deletedAt: null, moderationState: 'normal' })
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

    if (status === 'scheduled' && scheduledAt) {
      await this.postScheduler.schedulePostPublish(
        doc._id.toString(),
        scheduledAt,
      );
    }

    await this.upsertHashtags(normalizedHashtags);

    await this.notifyMentionedUsers({
      actorId: authorId,
      postId: doc._id.toString(),
      postKind: doc.kind ?? 'post',
      mentions: normalizedMentions,
      source: 'post',
    });

    if (repostOf) {
      await this.postModel
        .updateOne({ _id: repostOf }, { $inc: { 'stats.reposts': 1 } })
        .exec();
    }

    const moderationSummary = this.resolvePostModerationSummary(media);
    if (moderationSummary?.decision === 'reject') {
      await this.applyAutoModerationRejectToPost({
        authorId,
        postId: doc._id.toString(),
        reason:
          moderationSummary.reasons[0] ??
          'Automated moderation rejected this post',
        allReasons: moderationSummary.reasons,
      });
    }

    if (moderationSummary) {
      await this.notificationsService.createPostModerationResultNotification({
        recipientId: authorId,
        postId: doc._id.toString(),
        postKind: 'post',
        decision: moderationSummary.decision,
        reasons: moderationSummary.reasons,
      });
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
      .select('authorId hashtags mentions kind moderationState visibility')
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
    let addedMentions: string[] = [];
    if (dto.mentions !== undefined) {
      const prevMentions = Array.isArray(post.mentions) ? post.mentions : [];
      const nextMentions = this.normalizeMentions(
        dto.mentions ?? [],
        typeof dto.content === 'string' ? dto.content : undefined,
      );
      update.mentions = nextMentions;
      const prevSet = new Set(prevMentions);
      addedMentions = nextMentions.filter((m) => !prevSet.has(m));
    }
    if (dto.topics !== undefined) {
      update.topics = this.normalizeTopics(dto.topics ?? []);
    }
    if (dto.location !== undefined) {
      update.location = dto.location?.trim() || null;
    }
    if (dto.visibility !== undefined) {
      if (
        post.moderationState === 'restricted' &&
        dto.visibility !== 'followers'
      ) {
        throw new ForbiddenException(
          'Visibility is locked to followers while reach restriction is active',
        );
      }
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

    if (addedMentions.length) {
      const freshKind = (fresh as { kind?: PostKind }).kind ?? 'post';
      await this.notifyMentionedUsers({
        actorId: authorId,
        postId: postObjectId.toString(),
        postKind: freshKind,
        mentions: addedMentions,
        source: 'post',
      });
    }

    return this.toResponse(this.postModel.hydrate(fresh) as Post);
  }

  async createReel(authorId: string, dto: CreateReelDto) {
    await this.assertInteractionNotMuted(authorId);

    const normalizedHashtags = this.normalizeHashtags(dto.hashtags ?? []);
    const normalizedMentions = this.normalizeMentions(
      dto.mentions ?? [],
      dto.content,
    );
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

    if (status === 'scheduled' && scheduledAt) {
      await this.postScheduler.schedulePostPublish(
        doc._id.toString(),
        scheduledAt,
      );
    }

    await this.upsertHashtags(normalizedHashtags);

    await this.notifyMentionedUsers({
      actorId: authorId,
      postId: doc._id.toString(),
      postKind: doc.kind ?? 'reel',
      mentions: normalizedMentions,
      source: 'post',
    });

    const moderationSummary = this.resolvePostModerationSummary(media);
    if (moderationSummary?.decision === 'reject') {
      await this.applyAutoModerationRejectToPost({
        authorId,
        postId: doc._id.toString(),
        reason:
          moderationSummary.reasons[0] ??
          'Automated moderation rejected this reel',
        allReasons: moderationSummary.reasons,
      });
    }

    if (moderationSummary) {
      await this.notificationsService.createPostModerationResultNotification({
        recipientId: authorId,
        postId: doc._id.toString(),
        postKind: 'reel',
        decision: moderationSummary.decision,
        reasons: moderationSummary.reasons,
      });
    }

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

  private escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private buildHashtagPrefixes(tag: string, minLength = 4, maxLength = 18) {
    const safeTag = tag?.toString().trim().toLowerCase();
    if (!safeTag) return [] as string[];

    const upper = Math.min(maxLength, safeTag.length - 1);
    if (upper < minLength) return [] as string[];

    const prefixes: string[] = [];
    for (let i = minLength; i <= upper; i += 1) {
      prefixes.push(safeTag.slice(0, i));
    }
    return prefixes;
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

  private normalizeMentions(handles: string[], content?: string): string[] {
    const normalized = new Set(
      (handles ?? [])
        .map((h) => h?.toString().trim().replace(/^@/, '').toLowerCase())
        .filter(Boolean),
    );

    const text = typeof content === 'string' ? content : '';
    const regex = /@([a-zA-Z0-9_.]{1,30})/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const username = (match[1] ?? '').toLowerCase().trim();
      if (username) normalized.add(username);
    }

    return Array.from(normalized).slice(0, 30);
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

  private async notifyMentionedUsers(params: {
    actorId: string;
    postId: string;
    postKind: PostKind;
    mentions: string[];
    source: 'post' | 'comment';
  }): Promise<void> {
    const { actorId, postId, postKind, mentions, source } = params;
    if (!mentions.length) return;

    const profiles = await this.profileModel
      .find({ username: { $in: mentions } })
      .select('userId')
      .lean();

    const actorObjectId = new Types.ObjectId(actorId);
    const recipientIds = Array.from(
      new Set(profiles.map((p) => p.userId?.toString?.()).filter(Boolean)),
    ).filter((id) => id !== actorObjectId.toString());

    await Promise.all(
      recipientIds.map((recipientId) =>
        this.notificationsService.createPostMentionNotification({
          actorId,
          recipientId,
          postId,
          postKind,
          source,
        }),
      ),
    );
  }

  private toResponse(
    doc: Post,
    profile?: {
      userId?: Types.ObjectId;
      displayName?: string;
      username?: string;
      avatarUrl?: string;
      isCreatorVerified?: boolean;
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
      isCreatorVerified?: boolean;
    } | null,
    repostSourcePost?: {
      content?: string;
      media?: Post['media'];
    } | null,
  ) {
    return {
      kind: doc.kind,
      id: doc.id,
      authorId: doc.authorId?.toString?.(),
      authorDisplayName: profile?.displayName,
      authorUsername: profile?.username,
      authorAvatarUrl: profile?.avatarUrl,
      authorIsCreatorVerified: Boolean(profile?.isCreatorVerified),
      author: profile
        ? {
            id: profile.userId?.toString?.(),
            displayName: profile.displayName,
            username: profile.username,
            avatarUrl: profile.avatarUrl,
            isCreatorVerified: Boolean(profile.isCreatorVerified),
          }
        : undefined,
      content: doc.content,
      media: doc.media,
      hashtags: doc.hashtags,
      mentions: doc.mentions,
      topics: doc.topics,
      location: doc.location,
      visibility: doc.visibility,
      moderationState: doc.moderationState ?? 'normal',
      canRepost: (doc.moderationState ?? 'normal') === 'normal',
      allowComments: doc.allowComments,
      allowDownload: doc.allowDownload,
      hideLikeCount: doc.hideLikeCount,
      status: doc.status,
      scheduledAt: doc.scheduledAt,
      publishedAt: doc.publishedAt,
      notificationsMutedUntil: doc.notificationsMutedUntil ?? null,
      notificationsMutedIndefinitely:
        doc.notificationsMutedIndefinitely ?? false,
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
      repostOfAuthorIsCreatorVerified: Boolean(
        repostSourceProfile?.isCreatorVerified,
      ),
      repostOfAuthor: repostSourceProfile
        ? {
            id: repostSourceProfile.userId?.toString?.(),
            displayName: repostSourceProfile.displayName,
            username: repostSourceProfile.username,
            avatarUrl: repostSourceProfile.avatarUrl,
            isCreatorVerified: Boolean(repostSourceProfile.isCreatorVerified),
          }
        : undefined,
      repostSourceContent: repostSourcePost?.content ?? null,
      repostSourceMedia: repostSourcePost?.media ?? null,
      primaryVideoDurationMs: doc.primaryVideoDurationMs ?? null,
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

  private async getSponsoredBoostByPostId(postIds: string[], now: Date) {
    if (!postIds.length) {
      return new Map<string, number>();
    }

    await this.paymentTransactionModel
      .updateMany(
        {
          promotedPostId: { $in: postIds },
          isExpiredHidden: { $ne: true },
          expiresAt: { $lte: now },
        },
        {
          $set: {
            isExpiredHidden: true,
            hiddenAt: now,
            hiddenReason: 'expired',
          },
        },
      )
      .exec();

    const activeSponsored = await this.paymentTransactionModel
      .find({
        promotedPostId: { $in: postIds },
        isExpiredHidden: { $ne: true },
        hiddenReason: { $nin: ['paused', 'canceled', 'expired'] },
        startsAt: { $lte: now },
        expiresAt: { $gt: now },
        $or: [
          { paymentStatus: 'paid' },
          { paymentStatus: 'no_payment_required' },
          { checkoutStatus: 'complete' },
        ],
      })
      .select('promotedPostId boostWeight')
      .lean();

    const boostByPostId = new Map<string, number>();
    activeSponsored.forEach((item) => {
      const postId = item.promotedPostId?.toString?.();
      if (!postId) return;
      const weight =
        typeof item.boostWeight === 'number' &&
        Number.isFinite(item.boostWeight)
          ? Math.max(0, item.boostWeight)
          : 0;
      const current = boostByPostId.get(postId) ?? 0;
      if (weight > current) {
        boostByPostId.set(postId, weight);
      }
    });

    return boostByPostId;
  }

  private async getSponsoredCtaByPostId(postIds: string[], now: Date) {
    if (!postIds.length) {
      return new Map<string, string>();
    }

    const activeSponsored = await this.paymentTransactionModel
      .find({
        promotedPostId: { $in: postIds },
        isExpiredHidden: { $ne: true },
        hiddenReason: { $nin: ['paused', 'canceled', 'expired'] },
        startsAt: { $lte: now },
        expiresAt: { $gt: now },
        $or: [
          { paymentStatus: 'paid' },
          { paymentStatus: 'no_payment_required' },
          { checkoutStatus: 'complete' },
        ],
      })
      .select('promotedPostId ctaLabel paidAt createdAt')
      .sort({ paidAt: -1, createdAt: -1 })
      .lean();

    const ctaByPostId = new Map<string, string>();
    activeSponsored.forEach((item) => {
      const postId = item.promotedPostId?.toString?.();
      if (!postId || ctaByPostId.has(postId)) return;
      const cta = (item.ctaLabel ?? '').toString().trim();
      if (cta) {
        ctaByPostId.set(postId, cta);
      }
    });

    return ctaByPostId;
  }

  private async isPostCurrentlySponsored(postId: string, now: Date) {
    const active = await this.paymentTransactionModel
      .findOne({
        promotedPostId: postId,
        isExpiredHidden: { $ne: true },
        hiddenReason: { $nin: ['paused', 'canceled', 'expired'] },
        startsAt: { $lte: now },
        expiresAt: { $gt: now },
        $or: [
          { paymentStatus: 'paid' },
          { paymentStatus: 'no_payment_required' },
          { checkoutStatus: 'complete' },
        ],
      })
      .select('_id')
      .lean();

    return Boolean(active?._id);
  }

  private deriveSponsoredDurationDays(
    durationPackageId?: string | null,
    existingDurationDays?: number | null,
  ) {
    if (
      typeof existingDurationDays === 'number' &&
      Number.isFinite(existingDurationDays) &&
      existingDurationDays > 0
    ) {
      return Math.floor(existingDurationDays);
    }
    return this.sponsoredDurationDaysByPackage[durationPackageId ?? ''] ?? 7;
  }

  private deriveSponsoredBoostWeight(
    boostPackageId?: string | null,
    existingBoostWeight?: number | null,
  ) {
    if (
      typeof existingBoostWeight === 'number' &&
      Number.isFinite(existingBoostWeight) &&
      existingBoostWeight > 0
    ) {
      return existingBoostWeight;
    }
    return this.sponsoredBoostWeightByPackage[boostPackageId ?? ''] ?? 0.3;
  }

  private async normalizeSponsoredCampaigns(now: Date, limit = 200) {
    const needingBackfill = await this.paymentTransactionModel
      .find({
        isExpiredHidden: { $ne: true },
        $and: [
          {
            $or: [
              { paymentStatus: 'paid' },
              { paymentStatus: 'no_payment_required' },
              { checkoutStatus: 'complete' },
            ],
          },
          {
            $or: [
              { promotedPostId: null },
              { startsAt: null },
              { expiresAt: null },
              { durationDays: { $exists: false } },
              { durationDays: { $lte: 0 } },
              { boostWeight: { $exists: false } },
              { boostWeight: { $lte: 0 } },
            ],
          },
        ],
      })
      .select(
        'userId promotedPostId startsAt expiresAt paidAt createdAt durationDays durationPackageId boostWeight boostPackageId',
      )
      .sort({ paidAt: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    for (const tx of needingBackfill) {
      let promotedPostId = tx.promotedPostId?.toString?.() ?? null;
      if (!promotedPostId && Types.ObjectId.isValid(tx.userId)) {
        const latestPublishedPost = await this.postModel
          .findOne({
            authorId: new Types.ObjectId(tx.userId),
            status: 'published',
            visibility: { $ne: 'private' },
            moderationState: { $in: ['normal', 'restricted', null] },
            deletedAt: null,
            publishedAt: { $ne: null },
          })
          .sort({ publishedAt: -1, createdAt: -1 })
          .select('_id')
          .lean();
        promotedPostId = latestPublishedPost?._id?.toString?.() ?? null;
      }

      const durationDays = this.deriveSponsoredDurationDays(
        tx.durationPackageId,
        tx.durationDays,
      );
      const boostWeight = this.deriveSponsoredBoostWeight(
        tx.boostPackageId,
        tx.boostWeight,
      );
      const startsAt = tx.startsAt ?? tx.paidAt ?? tx.createdAt ?? now;
      const expiresAt =
        tx.expiresAt ??
        new Date(startsAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
      const expired = expiresAt.getTime() <= now.getTime();

      await this.paymentTransactionModel
        .updateOne(
          { _id: tx._id },
          {
            $set: {
              promotedPostId,
              durationDays,
              boostWeight,
              startsAt,
              expiresAt,
              isExpiredHidden: expired,
              hiddenAt: expired ? now : null,
              hiddenReason: expired ? 'expired' : null,
            },
          },
        )
        .exec();
    }
  }

  private async getActiveSponsoredPostIds(now: Date, limit = 200) {
    await this.normalizeSponsoredCampaigns(now, limit);

    await this.paymentTransactionModel
      .updateMany(
        {
          isExpiredHidden: { $ne: true },
          expiresAt: { $lte: now },
        },
        {
          $set: {
            isExpiredHidden: true,
            hiddenAt: now,
            hiddenReason: 'expired',
          },
        },
      )
      .exec();

    const activeSponsored = await this.paymentTransactionModel
      .find({
        promotedPostId: { $ne: null },
        isExpiredHidden: { $ne: true },
        hiddenReason: { $nin: ['paused', 'canceled', 'expired'] },
        startsAt: { $lte: now },
        expiresAt: { $gt: now },
        $or: [
          { paymentStatus: 'paid' },
          { paymentStatus: 'no_payment_required' },
          { checkoutStatus: 'complete' },
        ],
      })
      .select('promotedPostId')
      .sort({ paidAt: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    return Array.from(
      new Set(
        activeSponsored
          .map((item) => item.promotedPostId?.toString?.())
          .filter((id): id is string => Boolean(id)),
      ),
    );
  }

  private applySponsoredSpacing(
    scored: Array<{ post: Post; score: number }>,
    sponsoredPostIds: Set<string>,
    pageSize: number,
  ) {
    if (!scored.length || !sponsoredPostIds.size) {
      return scored;
    }

    const minSpacing = 5;
    const maxSponsored = Math.max(1, Math.floor(pageSize / minSpacing));

    const arranged: Array<{ post: Post; score: number }> = [];
    const overflowSponsored: Array<{ post: Post; score: number }> = [];
    let sponsoredCount = 0;
    let lastSponsoredIndex = -minSpacing;

    scored.forEach((item) => {
      const postId = item.post._id?.toString?.() ?? '';
      const isSponsored = sponsoredPostIds.has(postId);
      if (!isSponsored) {
        arranged.push(item);
        return;
      }

      const canPlaceBySpacing =
        arranged.length - lastSponsoredIndex >= minSpacing;
      if (sponsoredCount < maxSponsored && canPlaceBySpacing) {
        arranged.push(item);
        sponsoredCount += 1;
        lastSponsoredIndex = arranged.length - 1;
        return;
      }

      overflowSponsored.push(item);
    });

    // Keep stable output length by appending overflow campaigns after normal posts.
    return [...arranged, ...overflowSponsored];
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

  private async getRecentAdImpressionSignals(params: {
    userObjectId: Types.ObjectId;
    promotedIds: string[];
    now: Date;
  }) {
    const { userObjectId, promotedIds, now } = params;
    const signals = new Map<
      string,
      {
        dailyImpressions: number;
        lastImpressionAt: Date | null;
      }
    >();

    if (!promotedIds.length) {
      return signals;
    }

    const promotedObjectIds = promotedIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (!promotedObjectIds.length) {
      return signals;
    }

    const rollingWindowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [dailyRows, latestRows] = await Promise.all([
      this.adEngagementEventModel
        .aggregate<{
          _id: Types.ObjectId;
          count: number;
        }>([
          {
            $match: {
              userId: userObjectId,
              eventType: 'impression',
              promotedPostId: { $in: promotedObjectIds },
              createdAt: { $gte: rollingWindowStart },
            },
          },
          {
            $group: {
              _id: '$promotedPostId',
              count: { $sum: 1 },
            },
          },
        ])
        .exec(),
      this.adEngagementEventModel
        .aggregate<{
          _id: Types.ObjectId;
          lastImpressionAt: Date;
        }>([
          {
            $match: {
              userId: userObjectId,
              eventType: 'impression',
              promotedPostId: { $in: promotedObjectIds },
            },
          },
          {
            $group: {
              _id: '$promotedPostId',
              lastImpressionAt: { $max: '$createdAt' },
            },
          },
        ])
        .exec(),
    ]);

    dailyRows.forEach((item) => {
      const promotedId = item._id?.toString?.();
      if (!promotedId) return;
      signals.set(promotedId, {
        dailyImpressions: Math.max(0, Number(item.count ?? 0)),
        lastImpressionAt: null,
      });
    });

    latestRows.forEach((item) => {
      const promotedId = item._id?.toString?.();
      if (!promotedId) return;
      const current = signals.get(promotedId) ?? {
        dailyImpressions: 0,
        lastImpressionAt: null,
      };
      signals.set(promotedId, {
        ...current,
        lastImpressionAt:
          item.lastImpressionAt instanceof Date ? item.lastImpressionAt : null,
      });
    });

    return signals;
  }

  private applyAdFrequencyCap(
    scored: Array<{ post: Post; score: number }>,
    sponsoredPostIds: Set<string>,
    signals: Map<
      string,
      {
        dailyImpressions: number;
        lastImpressionAt: Date | null;
      }
    >,
    now: Date,
  ) {
    if (!scored.length || !sponsoredPostIds.size) {
      return scored;
    }

    const cooldownMs = ADS_FREQUENCY_COOLDOWN_MINUTES * 60 * 1000;
    const shownInThisResponse = new Map<string, number>();

    return scored.filter((item) => {
      const postId = item.post._id?.toString?.() ?? '';
      const repostSourceId = item.post.repostOf?.toString?.() ?? '';
      const promotedId = sponsoredPostIds.has(postId)
        ? postId
        : repostSourceId && sponsoredPostIds.has(repostSourceId)
          ? repostSourceId
          : '';

      if (!promotedId) {
        return true;
      }

      const signal = signals.get(promotedId);
      const alreadyShown = shownInThisResponse.get(promotedId) ?? 0;
      const dailyImpressions = (signal?.dailyImpressions ?? 0) + alreadyShown;
      if (dailyImpressions >= ADS_FREQUENCY_MAX_IMPRESSIONS_24H) {
        return false;
      }

      const lastMs = signal?.lastImpressionAt?.getTime?.();
      if (typeof lastMs === 'number' && Number.isFinite(lastMs)) {
        const elapsed = now.getTime() - lastMs;
        if (elapsed >= 0 && elapsed < cooldownMs) {
          return false;
        }
      }

      shownInThisResponse.set(promotedId, alreadyShown + 1);
      return true;
    });
  }

  private async assertInteractionNotMuted(userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new UnauthorizedException('Unauthorized');
    }

    const userObjectId = new Types.ObjectId(userId);
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
    const isAudio = file.mimetype.startsWith('audio/');
    const isVideo = file.mimetype.startsWith('video/');
    // Cloudinary handles audio under resource_type "video" by default.
    const resourceType = isVideo || isAudio ? 'video' : 'image';

    const moderation = isAudio
      ? {
          decision: 'approve' as const,
          reasons: ['audio upload - moderation skipped'],
          provider: 'skipped',
          scores: {},
        }
      : resourceType === 'image'
        ? await this.mediaModerationService.moderateImage({
            buffer: file.buffer,
            filename: file.originalname,
            mimetype: file.mimetype,
          })
        : await this.mediaModerationService.moderateVideo({
            buffer: file.buffer,
            filename: file.originalname,
            mimetype: file.mimetype,
          });

    const folder = this.buildUploadFolder(authorId);

    const upload = await this.cloudinary.uploadBuffer({
      buffer: file.buffer,
      folder,
      resourceType,
      overwrite: false,
    });

    const secureUrl =
      moderation.decision === 'blur'
        ? resourceType === 'image'
          ? this.cloudinary.buildBlurImageUrl({
              publicId: upload.publicId,
              secure: true,
            })
          : this.cloudinary.buildBlurVideoUrl({
              publicId: upload.publicId,
              secure: true,
            })
        : upload.secureUrl;

    const url =
      moderation.decision === 'blur'
        ? resourceType === 'image'
          ? this.cloudinary.buildBlurImageUrl({
              publicId: upload.publicId,
              secure: false,
            })
          : this.cloudinary.buildBlurVideoUrl({
              publicId: upload.publicId,
              secure: false,
            })
        : upload.url;

    return {
      folder,
      url,
      secureUrl,
      originalUrl: upload.url,
      originalSecureUrl: upload.secureUrl,
      publicId: upload.publicId,
      resourceType: upload.resourceType,
      bytes: upload.bytes,
      format: upload.format,
      width: upload.width,
      height: upload.height,
      duration: upload.duration,
      moderationDecision: moderation.decision,
      moderationProvider: moderation.provider,
      moderationReasons: moderation.reasons,
      moderationScores: moderation.scores,
    };
  }

  private resolvePostModerationSummary(
    media: Array<{
      type: 'image' | 'video';
      url: string;
      metadata?: Record<string, unknown> | null;
    }>,
  ): {
    decision: 'approve' | 'blur' | 'reject';
    reasons: string[];
  } | null {
    const decisions = (media ?? [])
      .map((item) => {
        const rawDecision = item?.metadata?.['moderationDecision'];
        if (
          rawDecision === 'approve' ||
          rawDecision === 'blur' ||
          rawDecision === 'reject'
        ) {
          const reasonsRaw = item?.metadata?.['moderationReasons'];
          const reasons = Array.isArray(reasonsRaw)
            ? reasonsRaw.filter(
                (value): value is string => typeof value === 'string',
              )
            : [];
          return { decision: rawDecision, reasons };
        }
        return null;
      })
      .filter(
        (
          value,
        ): value is {
          decision: 'approve' | 'blur' | 'reject';
          reasons: string[];
        } => Boolean(value),
      );

    if (!decisions.length) return null;

    if (decisions.some((item) => item.decision === 'reject')) {
      return {
        decision: 'reject',
        reasons:
          decisions.find((item) => item.decision === 'reject')?.reasons ?? [],
      };
    }

    if (decisions.some((item) => item.decision === 'blur')) {
      return {
        decision: 'blur',
        reasons:
          decisions.find((item) => item.decision === 'blur')?.reasons ?? [],
      };
    }

    return {
      decision: 'approve',
      reasons:
        decisions.find((item) => item.decision === 'approve')?.reasons ?? [],
    };
  }

  private async applyAutoModerationRejectToPost(params: {
    authorId: string;
    postId: string;
    reason: string;
    allReasons: string[];
  }) {
    const authorObjectId = this.asObjectId(params.authorId, 'authorId');
    const postObjectId = this.asObjectId(params.postId, 'postId');
    const admin = await this.userModel
      .findOne({ roles: 'admin', status: 'active' })
      .select('_id')
      .lean()
      .exec();
    const moderatorId = admin?._id
      ? new Types.ObjectId(admin._id)
      : authorObjectId;

    await this.moderationActionModel.create({
      targetType: 'post',
      targetId: postObjectId,
      action: 'remove_post',
      category: 'automated_content_moderation',
      reason: params.reason,
      severity: 'low',
      note: `Auto reject: ${params.allReasons.join(', ')}`,
      moderatorId,
    });

    await this.postModel
      .updateOne(
        { _id: postObjectId },
        {
          $set: {
            moderationState: 'removed',
            deletedAt: new Date(),
            deletedBy: moderatorId,
            deletedSource: 'system',
            deletedReason: params.reason,
          },
        },
      )
      .exec();

    const offenderAfterReject = await this.userModel
      .findOneAndUpdate(
        { _id: authorObjectId },
        { $inc: { strikeCount: 1 } },
        { new: true },
      )
      .select('strikeCount')
      .lean()
      .exec();

    const strikeAfterReject =
      typeof offenderAfterReject?.strikeCount === 'number'
        ? offenderAfterReject.strikeCount
        : 1;
    await this.usersService.applyAutoStrikePenaltyOnThresholdCross({
      userId: authorObjectId,
      previousStrike: Math.max(0, strikeAfterReject - 1),
      nextStrike: strikeAfterReject,
    });
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
    const followerVisibleModerationFilter = {
      $in: ['normal', 'restricted', null] as const,
    };
    const publicDiscoveryModerationFilter = { $in: ['normal', null] as const };

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
    const hiddenObjectIds = Array.from(
      hiddenIds,
      (id) => new Types.ObjectId(id),
    );

    const followees = await this.followModel
      .find({ followerId: userObjectId })
      .select('followeeId')
      .lean();

    const followeeIds = followees.map((f) => f.followeeId.toString());
    const followeeSet = new Set(followeeIds);
    const followeeObjectIds = followeeIds.map((id) => new Types.ObjectId(id));

    const now = new Date();
    const activeSponsoredPostIds = await this.getActiveSponsoredPostIds(
      now,
      candidateLimit,
    );
    const sponsoredObjectIds = activeSponsoredPostIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

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
        moderationState: followerVisibleModerationFilter,
        deletedAt: null,
        publishedAt: { $ne: null },
        _id: { $nin: hiddenObjectIds },
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
        moderationState: followerVisibleModerationFilter,
        deletedAt: null,
        publishedAt: { $ne: null },
        _id: { $nin: hiddenObjectIds },
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
        moderationState: publicDiscoveryModerationFilter,
        deletedAt: null,
        publishedAt: { $ne: null },
        _id: { $nin: hiddenObjectIds },
      })
      .sort({ 'stats.hearts': -1, 'stats.comments': -1, createdAt: -1 })
      .limit(candidateLimit)
      .lean();

    const sponsoredCandidates = sponsoredObjectIds.length
      ? await this.postModel
          .find({
            _id: { $in: sponsoredObjectIds, $nin: hiddenObjectIds },
            authorId: { $nin: excludedAuthorIds },
            kind: { $in: allowedKinds },
            status: 'published',
            visibility: 'public',
            moderationState: publicDiscoveryModerationFilter,
            deletedAt: null,
            publishedAt: { $ne: null },
          })
          .sort({ createdAt: -1 })
          .limit(candidateLimit)
          .lean()
      : [];

    const bannedAuthorIds = await this.getBannedAuthorIdSet([
      ...ownedCandidates.map((item) => item.authorId),
      ...followCandidates.map((item) => item.authorId),
      ...exploreCandidates.map((item) => item.authorId),
      ...sponsoredCandidates.map((item) => item.authorId),
    ]);

    const merged: Post[] = [];
    const seen = new Set<string>();

    const pushCandidate = (raw: unknown) => {
      const candidate = raw as Post;
      // Handle lean documents safely and avoid duplicates/hidden posts
      const id = (
        candidate as { _id?: Types.ObjectId | string }
      )?._id?.toString?.();
      const authorId = candidate.authorId?.toString?.();
      if (!id || seen.has(id) || hiddenIds.has(id)) {
        return;
      }
      if (authorId && bannedAuthorIds.has(authorId)) {
        return;
      }
      merged.push(this.postModel.hydrate(candidate) as Post);
      seen.add(id);
    };

    [
      ...ownedCandidates,
      ...followCandidates,
      ...exploreCandidates,
      ...sponsoredCandidates,
    ].forEach((raw) => pushCandidate(raw));

    const mergedIds = merged
      .map((p) => p._id?.toString?.())
      .filter((id): id is string => Boolean(id));

    const sponsoredBoostByPostId = await this.getSponsoredBoostByPostId(
      mergedIds,
      now,
    );
    const sponsoredCtaByPostId = await this.getSponsoredCtaByPostId(
      mergedIds,
      now,
    );

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

    const sponsoredSignals = await this.buildSponsoredRankingSignals(
      merged,
      sponsoredBoostByPostId,
      now,
    );
    const reachRestrictedAuthorIds = await this.getReachRestrictedAuthorIdSet(
      merged.map((item) => item.authorId),
      now,
    );

    const scored = merged
      .map((post) => {
        const postId = post._id?.toString?.() ?? '';
        const authorId = post.authorId?.toString?.() ?? '';
        const boost = sponsoredBoostByPostId.get(postId) ?? 0;
        const isSponsored = sponsoredBoostByPostId.has(postId);
        const creatorPriority = isSponsored
          ? Number(
              sponsoredSignals.creatorVerifiedByAuthorId.get(authorId) ?? false,
            )
          : 0;
        const reputationPriority = isSponsored
          ? (sponsoredSignals.reputationByAuthorId.get(authorId) ?? 0)
          : 0;
        return {
          post,
          score: this.scorePost(
            post,
            followeeSet,
            now,
            boost,
            reachRestrictedAuthorIds.has(authorId),
          ),
          isSponsored,
          boost,
          creatorPriority,
          reputationPriority,
        };
      })
      .sort((a, b) => {
        if (a.isSponsored && b.isSponsored) {
          // Sponsored priority order: boost package -> creator verified -> reputation.
          if (b.boost !== a.boost) return b.boost - a.boost;
          if (b.creatorPriority !== a.creatorPriority) {
            return b.creatorPriority - a.creatorPriority;
          }
          if (b.reputationPriority !== a.reputationPriority) {
            return b.reputationPriority - a.reputationPriority;
          }
        }
        return b.score - a.score;
      });

    const prioritizedAll = [
      ...scored.filter((item) =>
        item.post._id ? !viewedIds.has(item.post._id.toString()) : true,
      ),
      ...scored.filter((item) =>
        item.post._id ? viewedIds.has(item.post._id.toString()) : false,
      ),
    ];

    const sponsoredPlacementSet = new Set(sponsoredBoostByPostId.keys());
    const impressionSignals = await this.getRecentAdImpressionSignals({
      userObjectId,
      promotedIds: Array.from(sponsoredPlacementSet),
      now,
    });

    const cappedPrioritized = this.applyAdFrequencyCap(
      prioritizedAll,
      sponsoredPlacementSet,
      impressionSignals,
      now,
    );

    let prioritized = this.applySponsoredSpacing(
      cappedPrioritized,
      sponsoredPlacementSet,
      safeLimit,
    );

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

    const profiles = await this.getProfilesWithCreatorVerification(authorIds);

    const profileMap = this.mapProfilesByUserId(profiles);

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
    let repostSourcePostMap = new Map<
      string,
      { content?: string; media?: Post['media'] }
    >();

    if (repostSourceIds.length) {
      const repostSources = await this.postModel
        .find({
          _id: { $in: repostSourceIds },
          deletedAt: null,
          moderationState: 'normal',
        })
        .select('authorId content media')
        .lean();

      repostSourcePostMap = new Map(
        repostSources
          .map((src) => {
            const key = src._id?.toString?.();
            if (!key) return null;
            return [
              key,
              {
                content: (src as { content?: string }).content ?? '',
                media: (src as { media?: Post['media'] }).media ?? [],
              },
            ] as [string, { content?: string; media?: Post['media'] }];
          })
          .filter(Boolean) as Array<
          [string, { content?: string; media?: Post['media'] }]
        >,
      );

      const repostAuthorIds = Array.from(
        new Set(
          repostSources
            .map((p) => p.authorId?.toString?.())
            .filter((id): id is string => Boolean(id)),
        ),
      ).map((id) => new Types.ObjectId(id));

      if (repostAuthorIds.length) {
        const repostProfiles =
          await this.getProfilesWithCreatorVerification(repostAuthorIds);

        this.mapProfilesByUserId(repostProfiles).forEach((profile, id) =>
          profileMap.set(id, profile),
        );

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

    const sponsoredPostIdSet = new Set(sponsoredBoostByPostId.keys());

    return pagePosts.map((post) => {
      const profile = profileMap.get(post.authorId?.toString?.() ?? '') || null;
      const baseFlags = interactionMap.get(post._id?.toString?.() ?? '') || {};
      const following = post.authorId
        ? followeeSet.has(post.authorId.toString())
        : false;
      const repostProfile = post.repostOf
        ? repostSourceProfileMap.get(post.repostOf.toString()) || null
        : null;
      const repostSourcePost = post.repostOf
        ? repostSourcePostMap.get(post.repostOf.toString()) || null
        : null;
      const response = this.toResponse(
        post,
        profile,
        { ...baseFlags, following },
        repostProfile,
        repostSourcePost,
      );
      const postId = post._id?.toString?.() ?? '';
      const repostSourceId = post.repostOf?.toString?.() ?? '';
      const isSponsoredPost =
        sponsoredPostIdSet.has(postId) ||
        (repostSourceId ? sponsoredPostIdSet.has(repostSourceId) : false);
      const promotedId = sponsoredPostIdSet.has(postId)
        ? postId
        : repostSourceId && sponsoredPostIdSet.has(repostSourceId)
          ? repostSourceId
          : '';
      return {
        ...response,
        sponsored: isSponsoredPost,
        cta: promotedId ? (sponsoredCtaByPostId.get(promotedId) ?? '') : '',
      };
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
    const followerVisibleModerationFilter = {
      $in: ['normal', 'restricted', null] as const,
    };
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

    const { blockedIds, blockedByIds } =
      await this.blocksService.getBlockLists(userObjectId);
    const excludedAuthorIds = Array.from(
      new Set([...blockedIds, ...blockedByIds]),
      (id) => new Types.ObjectId(id),
    );

    const now = new Date();
    const hiddenObjectIds = Array.from(
      hiddenIds,
      (id) => new Types.ObjectId(id),
    );

    const followCandidates = await this.postModel
      .find({
        authorId: { $in: followeeObjectIds, $nin: excludedAuthorIds },
        kind: { $in: allowedKinds },
        status: 'published',
        visibility: { $ne: 'private' },
        moderationState: followerVisibleModerationFilter,
        deletedAt: null,
        publishedAt: { $ne: null },
        _id: { $nin: hiddenObjectIds },
      })
      .sort({ createdAt: -1 })
      .limit(candidateLimit)
      .lean();

    const bannedFollowingAuthors = await this.getBannedAuthorIdSet(
      followCandidates.map((item) => item.authorId),
    );

    const merged: Post[] = [];
    const seen = new Set<string>();

    const pushCandidate = (raw: unknown) => {
      const candidate = raw as Post;
      const id = (
        candidate as { _id?: Types.ObjectId | string }
      )?._id?.toString?.();
      const authorId = candidate.authorId?.toString?.();
      if (!id || seen.has(id) || hiddenIds.has(id)) {
        return;
      }
      if (authorId && bannedFollowingAuthors.has(authorId)) {
        return;
      }
      merged.push(this.postModel.hydrate(candidate) as Post);
      seen.add(id);
    };

    followCandidates.forEach((raw) => pushCandidate(raw));

    const mergedIds = merged
      .map((p) => p._id?.toString?.())
      .filter((id): id is string => Boolean(id));
    const sponsoredBoostByPostId = new Map<string, number>();
    const sponsoredCtaByPostId = new Map<string, string>();
    const reachRestrictedAuthorIds = await this.getReachRestrictedAuthorIdSet(
      merged.map((item) => item.authorId),
      now,
    );

    const scored = merged
      .map((post) => {
        const boost = 0;
        const authorId = post.authorId?.toString?.() ?? '';
        return {
          post,
          score: this.scorePost(
            post,
            followeeSet,
            now,
            boost,
            reachRestrictedAuthorIds.has(authorId),
          ),
        };
      })
      .sort((a, b) => b.score - a.score);

    const prioritized = this.applySponsoredSpacing(
      scored,
      new Set(sponsoredBoostByPostId.keys()),
      safeLimit,
    );

    const topPosts = prioritized
      .slice(sliceStart, sliceEnd)
      .map((item) => item.post);

    const authorIds = Array.from(
      new Set(
        topPosts
          .map((p) => p.authorId?.toString?.())
          .filter((id): id is string => Boolean(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const profiles = await this.getProfilesWithCreatorVerification(authorIds);

    const profileMap = this.mapProfilesByUserId(profiles);

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
    let repostSourcePostMap = new Map<
      string,
      { content?: string; media?: Post['media'] }
    >();

    if (repostSourceIds.length) {
      const repostSources = await this.postModel
        .find({
          _id: { $in: repostSourceIds },
          deletedAt: null,
          moderationState: 'normal',
        })
        .select('authorId content media')
        .lean();

      repostSourcePostMap = new Map(
        repostSources
          .map((src) => {
            const key = src._id?.toString?.();
            if (!key) return null;
            return [
              key,
              {
                content: (src as { content?: string }).content ?? '',
                media: (src as { media?: Post['media'] }).media ?? [],
              },
            ] as [string, { content?: string; media?: Post['media'] }];
          })
          .filter(Boolean) as Array<
          [string, { content?: string; media?: Post['media'] }]
        >,
      );

      const repostAuthorIds = Array.from(
        new Set(
          repostSources
            .map((p) => p.authorId?.toString?.())
            .filter((id): id is string => Boolean(id)),
        ),
      ).map((id) => new Types.ObjectId(id));

      if (repostAuthorIds.length) {
        const repostProfiles =
          await this.getProfilesWithCreatorVerification(repostAuthorIds);

        this.mapProfilesByUserId(repostProfiles).forEach((profile, id) =>
          profileMap.set(id, profile),
        );

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

    const sponsoredPostIdSet = new Set(sponsoredBoostByPostId.keys());

    return topPosts.map((post) => {
      const profile = profileMap.get(post.authorId?.toString?.() ?? '') || null;
      const baseFlags = interactionMap.get(post._id?.toString?.() ?? '') || {};
      const following = post.authorId
        ? followeeSet.has(post.authorId.toString())
        : false;
      const repostProfile = post.repostOf
        ? repostSourceProfileMap.get(post.repostOf.toString()) || null
        : null;
      const repostSourcePost = post.repostOf
        ? repostSourcePostMap.get(post.repostOf.toString()) || null
        : null;
      const response = this.toResponse(
        post,
        profile,
        { ...baseFlags, following },
        repostProfile,
        repostSourcePost,
      );
      const postId = post._id?.toString?.() ?? '';
      const repostSourceId = post.repostOf?.toString?.() ?? '';
      const isSponsoredPost =
        sponsoredPostIdSet.has(postId) ||
        (repostSourceId ? sponsoredPostIdSet.has(repostSourceId) : false);
      const promotedId = sponsoredPostIdSet.has(postId)
        ? postId
        : repostSourceId && sponsoredPostIdSet.has(repostSourceId)
          ? repostSourceId
          : '';
      return {
        ...response,
        sponsored: isSponsoredPost,
        cta: promotedId ? (sponsoredCtaByPostId.get(promotedId) ?? '') : '',
      };
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
        moderationState: 'normal',
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

    const bannedExploreAuthors = await this.getBannedAuthorIdSet(
      candidateDocs.map((item) => item.authorId),
    );

    const visibleCandidateDocs = candidateDocs.filter((item) => {
      const authorId = item.authorId?.toString?.();
      return !authorId || !bannedExploreAuthors.has(authorId);
    });

    if (!visibleCandidateDocs.length)
      return [] as ReturnType<typeof this.toResponse>[];

    const taste = await this.getOrRebuildTasteProfile(userObjectId);

    const candidates = visibleCandidateDocs.map(
      (raw) => this.postModel.hydrate(raw) as Post,
    );
    const reachRestrictedAuthorIds = await this.getReachRestrictedAuthorIdSet(
      candidates.map((item) => item.authorId),
      now,
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
        const authorId = post.authorId?.toString?.() ?? '';
        const base = this.scorePost(
          post,
          new Set<string>(),
          now,
          0,
          reachRestrictedAuthorIds.has(authorId),
        );
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

    const profiles = await this.getProfilesWithCreatorVerification(authorIds);
    const profileMap = this.mapProfilesByUserId(profiles);

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
      .find({
        _id: { $in: postIds },
        deletedAt: null,
        moderationState: 'normal',
      })
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

    const escapedTag = this.escapeRegex(normalizedTag);
    const hashtagRegex = new RegExp(`^${escapedTag}`, 'i');
    const relatedPrefixes = this.buildHashtagPrefixes(normalizedTag);
    const hashtagMatch = relatedPrefixes.length
      ? {
          $or: [
            { hashtags: { $regex: hashtagRegex } },
            { hashtags: { $in: relatedPrefixes } },
          ],
        }
      : { hashtags: { $regex: hashtagRegex } };

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

    const visibilityMatch = {
      $or: [
        { authorId: viewerObjectId },
        { visibility: 'public' },
        {
          visibility: 'followers',
          authorId: { $in: followeeObjectIds },
        },
      ],
    };

    const { blockedIds, blockedByIds } =
      await this.blocksService.getBlockLists(viewerObjectId);
    const excludedAuthorIds = Array.from(
      new Set([...blockedIds, ...blockedByIds]),
      (id) => new Types.ObjectId(id),
    );

    const posts = await this.postModel
      .find({
        kind: 'post',
        status: 'published',
        moderationState: 'normal',
        deletedAt: null,
        publishedAt: { $ne: null },
        authorId: { $nin: excludedAuthorIds },
        _id: { $nin: Array.from(hiddenIds, (id) => new Types.ObjectId(id)) },
        $and: [hashtagMatch, visibilityMatch],
      })
      .sort({ createdAt: -1 })
      .limit(candidateLimit)
      .lean();

    const bannedHashtagAuthors = await this.getBannedAuthorIdSet(
      posts.map((item) => item.authorId),
    );

    const visiblePosts = posts.filter((item) => {
      const authorId = item.authorId?.toString?.();
      return !authorId || !bannedHashtagAuthors.has(authorId);
    });

    if (!visiblePosts.length) return [] as ReturnType<typeof this.toResponse>[];

    const now = new Date();
    const reachRestrictedAuthorIds = await this.getReachRestrictedAuthorIdSet(
      visiblePosts.map((item) => item.authorId),
      now,
    );
    const ranked = visiblePosts
      .map((raw) => this.postModel.hydrate(raw) as Post)
      .map((post) => {
        const authorId = post.authorId?.toString?.() ?? '';
        return {
          post,
          score: this.scorePost(
            post,
            followeeSet,
            now,
            0,
            reachRestrictedAuthorIds.has(authorId),
          ),
        };
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

    const pagePosts = ranked.slice(sliceStart, sliceEnd).map((x) => x.post);
    if (!pagePosts.length) return [] as ReturnType<typeof this.toResponse>[];

    const authorIds = Array.from(
      new Set(
        pagePosts
          .map((p) => p.authorId?.toString?.())
          .filter((id): id is string => Boolean(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const profiles = await this.getProfilesWithCreatorVerification(authorIds);

    const profileMap = this.mapProfilesByUserId(profiles);

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

    const escapedTag = this.escapeRegex(normalizedTag);
    const hashtagRegex = new RegExp(`^${escapedTag}`, 'i');
    const relatedPrefixes = this.buildHashtagPrefixes(normalizedTag);
    const hashtagMatch = relatedPrefixes.length
      ? {
          $or: [
            { hashtags: { $regex: hashtagRegex } },
            { hashtags: { $in: relatedPrefixes } },
          ],
        }
      : { hashtags: { $regex: hashtagRegex } };

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

    const visibilityMatch = {
      $or: [
        { authorId: viewerObjectId },
        { visibility: 'public' },
        {
          visibility: 'followers',
          authorId: { $in: followeeObjectIds },
        },
      ],
    };

    const { blockedIds, blockedByIds } =
      await this.blocksService.getBlockLists(viewerObjectId);
    const excludedAuthorIds = Array.from(
      new Set([...blockedIds, ...blockedByIds]),
      (id) => new Types.ObjectId(id),
    );

    const posts = await this.postModel
      .find({
        kind: 'reel',
        status: 'published',
        moderationState: 'normal',
        deletedAt: null,
        publishedAt: { $ne: null },
        authorId: { $nin: excludedAuthorIds },
        _id: { $nin: Array.from(hiddenIds, (id) => new Types.ObjectId(id)) },
        $and: [hashtagMatch, visibilityMatch],
      })
      .sort({ createdAt: -1 })
      .limit(candidateLimit)
      .lean();

    const bannedHashtagReelAuthors = await this.getBannedAuthorIdSet(
      posts.map((item) => item.authorId),
    );

    const visibleReels = posts.filter((item) => {
      const authorId = item.authorId?.toString?.();
      return !authorId || !bannedHashtagReelAuthors.has(authorId);
    });

    if (!visibleReels.length) return [] as ReturnType<typeof this.toResponse>[];

    const now = new Date();
    const reachRestrictedAuthorIds = await this.getReachRestrictedAuthorIdSet(
      visibleReels.map((item) => item.authorId),
      now,
    );
    const ranked = visibleReels
      .map((raw) => this.postModel.hydrate(raw) as Post)
      .map((post) => {
        const authorId = post.authorId?.toString?.() ?? '';
        return {
          post,
          score: this.scorePost(
            post,
            followeeSet,
            now,
            0,
            reachRestrictedAuthorIds.has(authorId),
          ),
        };
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

    const pageReels = ranked.slice(sliceStart, sliceEnd).map((x) => x.post);
    if (!pageReels.length) return [] as ReturnType<typeof this.toResponse>[];

    const authorIds = Array.from(
      new Set(
        pageReels
          .map((p) => p.authorId?.toString?.())
          .filter((id): id is string => Boolean(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const profiles = await this.getProfilesWithCreatorVerification(authorIds);

    const profileMap = this.mapProfilesByUserId(profiles);

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

    const targetUser = await this.userModel
      .findById(targetObjectId)
      .select('status')
      .lean();

    if (!targetUser || targetUser.status === 'banned') {
      return [] as ReturnType<typeof this.toResponse>[];
    }

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
        moderationState: { $in: ['normal', 'restricted', null] },
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

    const targetUser = await this.userModel
      .findById(targetObjectId)
      .select('status')
      .lean();

    if (!targetUser || targetUser.status === 'banned') {
      return [] as ReturnType<typeof this.toResponse>[];
    }

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
        moderationState: { $in: ['normal', 'restricted', null] },
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
        moderationState: { $in: ['normal', 'restricted', null] },
        deletedAt: null,
        publishedAt: { $ne: null },
      })
      .lean();

    const bannedSavedAuthors = await this.getBannedAuthorIdSet(
      posts.map((item) => item.authorId),
    );

    const filtered: Post[] = [];

    for (const raw of posts) {
      const doc = this.postModel.hydrate(raw) as Post;
      const authorId = doc.authorId?.toString?.();
      if (authorId && bannedSavedAuthors.has(authorId)) {
        continue;
      }

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

    const profiles = await this.getProfilesWithCreatorVerification(authorIds);

    const profileMap = this.mapProfilesByUserId(profiles);

    return limited.map((post) => {
      const profile = profileMap.get(post.authorId?.toString?.() ?? '') || null;
      return this.toResponse(post, profile, { saved: true });
    });
  }

  async getHiddenPosts(userId: string, limit = 24) {
    const viewerObjectId = this.asObjectId(userId, 'userId');
    const safeLimit = Math.min(Math.max(limit, 1), 60);

    const hides = await this.postInteractionModel
      .find({ userId: viewerObjectId, type: 'hide' })
      .sort({ createdAt: -1 })
      .limit(safeLimit * 4)
      .lean();

    if (!hides.length) {
      return [] as Array<
        ReturnType<typeof this.toResponse> & {
          hiddenAt?: Date | null;
        }
      >;
    }

    const postIds = Array.from(
      new Set(
        hides
          .map((item) => item.postId)
          .filter((id): id is Types.ObjectId => Boolean(id)),
      ),
    );

    if (!postIds.length) {
      return [] as Array<
        ReturnType<typeof this.toResponse> & {
          hiddenAt?: Date | null;
        }
      >;
    }

    const posts = await this.postModel
      .find({
        _id: { $in: postIds },
        status: 'published',
        moderationState: 'normal',
        deletedAt: null,
      })
      .lean();

    const bannedHiddenAuthors = await this.getBannedAuthorIdSet(
      posts.map((item) => item.authorId),
    );

    if (!posts.length) {
      return [] as Array<
        ReturnType<typeof this.toResponse> & {
          hiddenAt?: Date | null;
        }
      >;
    }

    const postMap = new Map<string, Post>();
    posts.forEach((raw) => {
      const doc = this.postModel.hydrate(raw) as Post;
      const authorId = doc.authorId?.toString?.();
      if (authorId && bannedHiddenAuthors.has(authorId)) {
        return;
      }
      const key = doc._id?.toString?.();
      if (key) postMap.set(key, doc);
    });

    const authorIds = Array.from(
      new Set(
        posts
          .map((p) => p.authorId?.toString?.())
          .filter((id): id is string => Boolean(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const profiles = await this.getProfilesWithCreatorVerification(authorIds);

    const profileMap = this.mapProfilesByUserId(profiles);

    const items: Array<
      ReturnType<typeof this.toResponse> & {
        hiddenAt?: Date | null;
      }
    > = [];

    for (const hide of hides) {
      const postId = hide.postId?.toString?.();
      if (!postId) continue;
      const post = postMap.get(postId);
      if (!post) continue;
      const profile = profileMap.get(post.authorId?.toString?.() ?? '') || null;
      items.push({
        ...this.toResponse(post, profile),
        hiddenAt: hide.createdAt ?? null,
      });
      if (items.length >= safeLimit) break;
    }

    return items;
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
        moderationState: { $in: ['normal', 'restricted', null] },
        deletedAt: null,
        publishedAt: { $ne: null },
      })
      .lean();

    const bannedSavedReelAuthors = await this.getBannedAuthorIdSet(
      posts.map((item) => item.authorId),
    );

    const postMap = new Map(
      posts
        .filter((p) => {
          const authorId = p.authorId?.toString?.();
          return !authorId || !bannedSavedReelAuthors.has(authorId);
        })
        .map((p) => [p._id?.toString?.() ?? '', this.postModel.hydrate(p)]),
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

    const profiles = await this.getProfilesWithCreatorVerification(authorIds);

    const profileMap = this.mapProfilesByUserId(profiles);

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
      .findOne({
        _id: postObjectId,
        deletedAt: null,
        moderationState: { $in: ['normal', 'restricted', null] },
      })
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

    const author = await this.userModel
      .findById(post.authorId)
      .select('status')
      .lean();
    if (!author || author.status === 'banned') {
      throw new NotFoundException('Post not found');
    }

    const isAuthor = post.authorId?.toString?.() === userId;

    if (!isAuthor && post.status !== 'published') {
      throw new ForbiddenException('Post is not published');
    }

    if (!isAuthor && post.visibility === 'private') {
      throw new ForbiddenException('Post is private');
    }

    if (!isAuthor && post.visibility === 'followers') {
      const follows = await this.followModel
        .findOne({ followerId: userObjectId, followeeId: post.authorId })
        .select('_id')
        .lean();
      if (!follows?._id) {
        throw new ForbiddenException('Post is available to followers only');
      }
    }

    await this.blocksService.assertNotBlocked(userObjectId, post.authorId);

    const profiles = await this.getProfilesWithCreatorVerification([
      post.authorId,
    ]);
    const profile = profiles[0] ?? null;

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
    await this.assertInteractionNotMuted(userId);

    const { postObjectId, userObjectId } = await this.resolveIds(
      userId,
      postId,
    );
    await this.assertPostAccessible(userObjectId, postObjectId);

    const post = await this.postModel
      .findOne({ _id: postObjectId, deletedAt: null })
      .select('authorId kind')
      .lean();

    const inserted = await this.upsertUniqueInteraction(
      userObjectId,
      postObjectId,
      'like',
      true,
    );
    if (inserted) {
      await this.bumpCounters(postObjectId, { 'stats.hearts': 1 });

      if (post?.authorId && !post.authorId.equals(userObjectId)) {
        await this.notificationsService.createPostLikeNotification({
          actorId: userObjectId.toString(),
          recipientId: post.authorId.toString(),
          postId: postObjectId.toString(),
          postKind: post.kind ?? 'post',
        });
      }

      const snapshot = await this.buildPostActivityMeta(postObjectId);
      await this.activityLogService.log({
        userId: userObjectId,
        type: 'post_like',
        postId: postObjectId,
        postKind: snapshot.postKind,
        meta: snapshot.meta,
      });
    }
    return { liked: true, created: inserted };
  }

  async unlike(userId: string, postId: string) {
    const { postObjectId, userObjectId } = await this.resolveIds(
      userId,
      postId,
    );
    await this.assertPostAccessible(userObjectId, postObjectId);

    const post = await this.postModel
      .findOne({ _id: postObjectId, deletedAt: null })
      .select('authorId')
      .lean();

    const removed = await this.removeUniqueInteraction(
      userObjectId,
      postObjectId,
      'like',
      true,
    );
    if (removed) {
      await this.bumpCounters(postObjectId, { 'stats.hearts': -1 });

      if (post?.authorId && !post.authorId.equals(userObjectId)) {
        const latest = await this.postInteractionModel
          .findOne({ postId: postObjectId, type: 'like' })
          .sort({ createdAt: -1 })
          .select('userId')
          .lean();

        await this.notificationsService.decrementPostLikeNotification({
          recipientId: post.authorId.toString(),
          postId: postObjectId.toString(),
          latestActorId: latest?.userId?.toString() ?? null,
        });
      }
    }
    return { liked: !removed };
  }

  async listPostLikes(params: {
    viewerId: string;
    postId: string;
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
    const { userObjectId, postObjectId } = await this.resolveIds(
      params.viewerId,
      params.postId,
    );

    const post = await this.postModel
      .findOne({ _id: postObjectId, deletedAt: null })
      .select('authorId visibility status')
      .lean();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (!post.authorId) {
      throw new ForbiddenException('Post author missing');
    }

    await this.blocksService.assertNotBlocked(userObjectId, post.authorId);

    const isAuthor = post.authorId?.equals(userObjectId) ?? false;
    if (!isAuthor) {
      if (post.status !== 'published') {
        throw new ForbiddenException('Post is not published');
      }
      if (post.visibility === 'private') {
        throw new ForbiddenException('Post is private');
      }
      if (post.visibility === 'followers') {
        const follows = await this.followModel
          .findOne({ followerId: userObjectId, followeeId: post.authorId })
          .select('_id')
          .lean();
        if (!follows?._id) {
          throw new ForbiddenException('Post is followers-only');
        }
      }
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

    const likes = await this.postInteractionModel
      .find({
        postId: postObjectId,
        type: 'like',
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

      const snapshot = await this.buildPostActivityMeta(postObjectId);
      await this.activityLogService.log({
        userId: userObjectId,
        type: 'save',
        postId: postObjectId,
        postKind: snapshot.postKind,
        meta: snapshot.meta,
      });
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
    await this.assertInteractionNotMuted(userId);

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

      const snapshot = await this.buildPostActivityMeta(postObjectId);
      await this.activityLogService.log({
        userId: userObjectId,
        type: 'repost',
        postId: postObjectId,
        postKind: snapshot.postKind,
        meta: snapshot.meta,
      });
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

  async unhide(userId: string, postId: string) {
    const { postObjectId, userObjectId } = await this.resolveIds(
      userId,
      postId,
    );

    const removed = await this.removeUniqueInteraction(
      userObjectId,
      postObjectId,
      'hide',
      true,
    );

    if (removed) {
      await this.bumpCounters(postObjectId, { 'stats.hides': -1 });
    }

    return { hidden: false };
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

      const snapshot = await this.buildPostActivityMeta(postObjectId);
      await this.activityLogService.log({
        userId: userObjectId,
        type: 'report_post',
        postId: postObjectId,
        postKind: snapshot.postKind,
        meta: snapshot.meta,
      });
    }
    return { reported: true };
  }

  async view(userId: string, postId: string, durationMs?: number) {
    const { postObjectId, userObjectId } = await this.resolveIds(
      userId,
      postId,
    );
    await this.assertPostAccessible(userObjectId, postObjectId);

    const now = new Date();
    const post = await this.postModel
      .findOne({ _id: postObjectId, deletedAt: null })
      .select('repostOf')
      .lean();

    const repostSourceId = post?.repostOf?.toString?.() ?? '';
    if (repostSourceId) {
      const isSponsoredRepost = await this.isPostCurrentlySponsored(
        repostSourceId,
        now,
      );

      if (isSponsoredRepost) {
        const existing = await this.postInteractionModel
          .findOne({
            userId: userObjectId,
            type: 'view',
            'metadata.promotedPostId': repostSourceId,
          })
          .select('_id')
          .lean();

        if (existing?._id) {
          return { viewed: true, deduped: true };
        }

        await this.postInteractionModel.create({
          userId: userObjectId,
          postId: postObjectId,
          type: 'view',
          durationMs: durationMs ?? null,
          metadata: {
            promotedPostId: repostSourceId,
            dedupeScope: 'sponsored_repost',
          },
        });

        await this.bumpCounters(postObjectId, {
          'stats.views': 1,
          'stats.impressions': 1,
        });

        return { viewed: true, deduped: false };
      }
    }

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
      .select('authorId visibility moderationState')
      .lean();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (!post.authorId || !post.authorId.equals(userObjectId)) {
      throw new ForbiddenException('Only the author can change visibility');
    }

    if (post.moderationState === 'restricted' && visibility !== 'followers') {
      throw new ForbiddenException(
        'Visibility is locked to followers while reach restriction is active',
      );
    }

    if (post.visibility === visibility) {
      return { visibility, unchanged: true };
    }

    await this.postModel
      .updateOne({ _id: postObjectId }, { $set: { visibility } })
      .exec();

    return { visibility, updated: true };
  }

  async getNotificationMute(userId: string, postId: string) {
    const { userObjectId, postObjectId } = await this.resolveIds(
      userId,
      postId,
    );

    const post = await this.postModel
      .findOne({ _id: postObjectId, deletedAt: null })
      .select('authorId notificationsMutedUntil notificationsMutedIndefinitely')
      .lean();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (!post.authorId || !post.authorId.equals(userObjectId)) {
      throw new ForbiddenException('Only the author can view this setting');
    }

    const mutedUntil = post.notificationsMutedUntil
      ? new Date(post.notificationsMutedUntil).toISOString()
      : null;
    const mutedIndefinitely = Boolean(post.notificationsMutedIndefinitely);
    const enabled = !mutedIndefinitely && !mutedUntil;

    return { enabled, mutedUntil, mutedIndefinitely };
  }

  async setNotificationMute(
    userId: string,
    postId: string,
    params: {
      enabled?: boolean;
      mutedUntil?: string | null;
      mutedIndefinitely?: boolean;
    },
  ) {
    const { userObjectId, postObjectId } = await this.resolveIds(
      userId,
      postId,
    );

    const post = await this.postModel
      .findOne({ _id: postObjectId, deletedAt: null })
      .select('authorId')
      .lean();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (!post.authorId || !post.authorId.equals(userObjectId)) {
      throw new ForbiddenException('Only the author can mute notifications');
    }

    const update: Record<string, unknown> = {};

    if (params.enabled) {
      update['notificationsMutedUntil'] = null;
      update['notificationsMutedIndefinitely'] = false;
      await this.postModel
        .updateOne({ _id: postObjectId }, { $set: update })
        .exec();
      return { enabled: true, mutedUntil: null, mutedIndefinitely: false };
    }

    let mutedUntil: Date | null = null;
    let mutedIndefinitely = Boolean(params.mutedIndefinitely);

    if (params.mutedUntil) {
      mutedUntil = new Date(params.mutedUntil);
      if (Number.isNaN(mutedUntil.getTime())) {
        throw new BadRequestException('Invalid mutedUntil value');
      }
      if (mutedUntil.getTime() <= Date.now()) {
        throw new BadRequestException('mutedUntil must be in the future');
      }
      mutedIndefinitely = false;
    }

    if (!mutedUntil && !mutedIndefinitely) {
      mutedIndefinitely = true;
    }

    update['notificationsMutedUntil'] = mutedUntil;
    update['notificationsMutedIndefinitely'] = mutedIndefinitely;

    await this.postModel
      .updateOne({ _id: postObjectId }, { $set: update })
      .exec();

    return {
      enabled: false,
      mutedUntil: mutedUntil ? mutedUntil.toISOString() : null,
      mutedIndefinitely,
    };
  }

  private async assertPostAccessible(
    viewerId: Types.ObjectId,
    postId: Types.ObjectId,
  ) {
    const post = await this.postModel
      .findOne({ _id: postId, deletedAt: null, moderationState: 'normal' })
      .select('authorId')
      .lean();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (!post.authorId) {
      throw new ForbiddenException('Post author missing');
    }

    const author = await this.userModel
      .findById(post.authorId)
      .select('status')
      .lean();

    if (!author || author.status === 'banned') {
      throw new NotFoundException('Post not found');
    }

    await this.blocksService.assertNotBlocked(viewerId, post.authorId);
    return post;
  }

  private async getBannedAuthorIdSet(
    ids: Array<string | Types.ObjectId | null | undefined>,
  ): Promise<Set<string>> {
    const authorIds = Array.from(
      new Set(
        ids
          .map((id) => id?.toString?.())
          .filter((id): id is string => Boolean(id))
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    );

    if (!authorIds.length) return new Set<string>();

    const bannedUsers = await this.userModel
      .find({
        _id: { $in: authorIds.map((id) => new Types.ObjectId(id)) },
        status: 'banned',
      })
      .select('_id')
      .lean();

    return new Set(
      bannedUsers
        .map((item) => item._id?.toString?.())
        .filter((id): id is string => Boolean(id)),
    );
  }

  private async getReachRestrictedAuthorIdSet(
    ids: Array<string | Types.ObjectId | null | undefined>,
    now: Date,
  ): Promise<Set<string>> {
    const authorIds = Array.from(
      new Set(
        ids
          .map((id) => id?.toString?.())
          .filter((id): id is string => Boolean(id))
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    );

    if (!authorIds.length) return new Set<string>();

    const restrictedUsers = await this.userModel
      .find({
        _id: { $in: authorIds.map((id) => new Types.ObjectId(id)) },
        reachRestrictedUntil: { $gt: now },
      })
      .select('_id')
      .lean();

    return new Set(
      restrictedUsers
        .map((item) => item._id?.toString?.())
        .filter((id): id is string => Boolean(id)),
    );
  }

  private async buildPostActivityMeta(postId: Types.ObjectId) {
    const post = await this.postModel
      .findOne({ _id: postId, deletedAt: null })
      .select('authorId kind content media')
      .lean();

    if (!post) {
      return { postKind: 'post' as PostKind, meta: null };
    }

    const profile = post.authorId
      ? await this.profileModel
          .findOne({ userId: post.authorId })
          .select('displayName username avatarUrl')
          .lean()
      : null;

    const caption = typeof post.content === 'string' ? post.content : '';

    return {
      postKind: post.kind ?? 'post',
      meta: {
        postCaption: caption || null,
        postMediaUrl: post.media?.[0]?.url ?? null,
        postAuthorId: post.authorId?.toString?.() ?? null,
        postAuthorDisplayName: profile?.displayName ?? null,
        postAuthorUsername: profile?.username ?? null,
        postAuthorAvatarUrl: profile?.avatarUrl ?? null,
      },
    };
  }

  private scorePost(
    post: Post,
    followeeSet: Set<string>,
    now: Date,
    sponsoredBoostWeight = 0,
    reachRestricted = false,
  ) {
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

    const baseScore =
      (engagement + 1) * freshness * qualityBoost * relationshipBoost;
    const sponsoredBoost = 1 + Math.max(0, sponsoredBoostWeight);
    const reachPenalty = reachRestricted ? REACH_RESTRICT_SCORE_MULTIPLIER : 1;
    return baseScore * sponsoredBoost * reachPenalty;
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
      .findOne({ _id: postId, deletedAt: null, moderationState: 'normal' })
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
