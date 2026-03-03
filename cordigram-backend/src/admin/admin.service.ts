import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { User } from '../users/user.schema';
import { Post } from '../posts/post.schema';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { LivekitService } from '../livekit/livekit.service';
import { ReportPost } from '../reportpost/reportpost.schema';
import { ReportComment } from '../reportcomment/reportcomment.schema';
import { ReportUser } from '../reportuser/reportuser.schema';
import { Profile } from '../profiles/profile.schema';
import { Comment } from '../comment/comment.schema';
import { ModerationAction } from '../moderation/moderation-action.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { InteractionMuteSchedulerService } from './interaction-mute-scheduler.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { CommentsService } from '../comment/comments.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(ReportPost.name)
    private readonly reportPostModel: Model<ReportPost>,
    @InjectModel(ReportComment.name)
    private readonly reportCommentModel: Model<ReportComment>,
    @InjectModel(ReportUser.name)
    private readonly reportUserModel: Model<ReportUser>,
    @InjectModel(Profile.name)
    private readonly profileModel: Model<Profile>,
    @InjectModel(Comment.name)
    private readonly commentModel: Model<Comment>,
    @InjectModel(ModerationAction.name)
    private readonly moderationActionModel: Model<ModerationAction>,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly commentsService: CommentsService,
    private readonly interactionMuteScheduler: InteractionMuteSchedulerService,
    private readonly cloudinary: CloudinaryService,
    private readonly livekit: LivekitService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  private getCategoryWeight(category: string): number {
    const weights: Record<string, number> = {
      violence: 5,
      illegal: 5,
      privacy: 4.5,
      sensitive: 4,
      abuse: 3,
      misinfo: 2.5,
      ip: 2,
      spam: 1.5,
      other: 1,
    };
    return weights[category] ?? 1;
  }

  private computeReporterWeight(params: {
    createdAt?: Date | null;
    isVerified?: boolean;
    status?: string;
    reportsLast7d: number;
  }): number {
    const { createdAt, isVerified, status, reportsLast7d } = params;
    const now = Date.now();
    const ageDays = createdAt
      ? Math.floor((now - new Date(createdAt).getTime()) / 86400000)
      : 0;
    let weight = 1;
    if (ageDays < 7) weight = 0.6;
    else if (ageDays < 30) weight = 0.8;
    else if (ageDays >= 180) weight = 1.2;
    if (isVerified) weight += 0.1;
    if (status && status !== 'active') weight -= 0.2;

    const spamPenalty = 1 / (1 + Math.max(0, reportsLast7d - 3) / 3);
    weight *= spamPenalty;

    return Math.min(1.5, Math.max(0.3, Number(weight.toFixed(2))));
  }

  private async getReportStats(): Promise<{
    openReportsCount: number;
    highRiskCount: number;
    medianScore: number | null;
    reportQueue: Array<{
      type: 'post' | 'comment' | 'user';
      targetId: string;
      title: string;
      topCategory: string;
      categories: string[];
      topReason: string;
      otherReasonCount: number;
      totalReports: number;
      uniqueReporters: number;
      score: number;
      severity: 'low' | 'medium' | 'high';
      autoHideSuggested: boolean;
      lastReportedAt: Date;
    }>;
  }> {
    const now = Date.now();
    const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [
      postReports,
      commentReports,
      userReports,
      postCounts,
      commentCounts,
      userCounts,
    ] = await Promise.all([
      this.reportPostModel
        .find({ createdAt: { $gte: since30d }, status: { $ne: 'resolved' } })
        .select('reporterId postId category reason createdAt')
        .lean(),
      this.reportCommentModel
        .find({ createdAt: { $gte: since30d }, status: { $ne: 'resolved' } })
        .select('reporterId commentId postId category reason createdAt')
        .lean(),
      this.reportUserModel
        .find({ createdAt: { $gte: since30d }, status: { $ne: 'resolved' } })
        .select('reporterId targetUserId category reason createdAt')
        .lean(),
      this.reportPostModel
        .aggregate([
          {
            $match: {
              createdAt: { $gte: since7d },
              status: { $ne: 'resolved' },
            },
          },
          { $group: { _id: '$reporterId', count: { $sum: 1 } } },
        ])
        .exec(),
      this.reportCommentModel
        .aggregate([
          {
            $match: {
              createdAt: { $gte: since7d },
              status: { $ne: 'resolved' },
            },
          },
          { $group: { _id: '$reporterId', count: { $sum: 1 } } },
        ])
        .exec(),
      this.reportUserModel
        .aggregate([
          {
            $match: {
              createdAt: { $gte: since7d },
              status: { $ne: 'resolved' },
            },
          },
          { $group: { _id: '$reporterId', count: { $sum: 1 } } },
        ])
        .exec(),
    ]);

    const reporterCounts = new Map<string, number>();
    const mergeCounts = (rows: Array<{ _id: unknown; count: number }>) => {
      rows.forEach((row) => {
        const key = row._id?.toString?.();
        if (!key) return;
        reporterCounts.set(key, (reporterCounts.get(key) ?? 0) + row.count);
      });
    };
    mergeCounts(postCounts);
    mergeCounts(commentCounts);
    mergeCounts(userCounts);

    const reporterIds = new Set<string>();
    [...postReports, ...commentReports, ...userReports].forEach((report) => {
      const id = report.reporterId?.toString?.();
      if (id) reporterIds.add(id);
    });

    const reporters = reporterIds.size
      ? await this.userModel
          .find({ _id: { $in: Array.from(reporterIds) } })
          .select('createdAt isVerified status')
          .lean()
      : [];

    const reporterMeta = new Map(
      reporters.map((user) => [user._id.toString(), user]),
    );

    const reporterWeights = new Map<string, number>();
    reporterIds.forEach((id) => {
      const meta = reporterMeta.get(id);
      const reportsLast7d = reporterCounts.get(id) ?? 0;
      reporterWeights.set(
        id,
        this.computeReporterWeight({
          createdAt: meta?.createdAt ?? null,
          isVerified: meta?.isVerified ?? false,
          status: meta?.status ?? 'active',
          reportsLast7d,
        }),
      );
    });

    type Agg = {
      type: 'post' | 'comment' | 'user';
      targetId: string;
      totalReports: number;
      reporters: Set<string>;
      score: number;
      categoryCounts: Record<string, number>;
      maxCategoryWeight: number;
      lastReportedAt: Date;
    };

    const queueMap = new Map<string, Agg>();
    const addReport = (
      type: 'post' | 'comment' | 'user',
      targetId: string,
      report: { reporterId: any; category: string; createdAt?: Date },
    ) => {
      const key = `${type}:${targetId}`;
      const reporterId = report.reporterId?.toString?.() ?? 'unknown';
      const weight = reporterWeights.get(reporterId) ?? 0.5;
      const categoryWeight = this.getCategoryWeight(report.category);
      const score = weight * categoryWeight;
      const reportedAt = report.createdAt ?? new Date();
      const existing = queueMap.get(key);
      if (existing) {
        existing.totalReports += 1;
        existing.reporters.add(reporterId);
        existing.score += score;
        existing.categoryCounts[report.category] =
          (existing.categoryCounts[report.category] ?? 0) + 1;
        existing.maxCategoryWeight = Math.max(
          existing.maxCategoryWeight,
          categoryWeight,
        );
        if (reportedAt > existing.lastReportedAt) {
          existing.lastReportedAt = reportedAt;
        }
        return;
      }

      queueMap.set(key, {
        type,
        targetId,
        totalReports: 1,
        reporters: new Set([reporterId]),
        score,
        categoryCounts: { [report.category]: 1 },
        maxCategoryWeight: categoryWeight,
        lastReportedAt: reportedAt,
      });
    };

    postReports.forEach((report) =>
      addReport('post', report.postId?.toString?.() ?? '', report),
    );
    commentReports.forEach((report) =>
      addReport('comment', report.commentId?.toString?.() ?? '', report),
    );
    userReports.forEach((report) =>
      addReport('user', report.targetUserId?.toString?.() ?? '', report),
    );

    const queue = Array.from(queueMap.values())
      .filter((item) => item.targetId)
      .map((item) => {
        const categoryEntries = Object.entries(item.categoryCounts).sort(
          (a, b) => b[1] - a[1],
        );
        const topCategory = categoryEntries[0]?.[0];
        const categories = categoryEntries.map(([category]) => category);
        const otherReasonCount = Math.max(0, categoryEntries.length - 1);
        const uniqueReporters = item.reporters.size;
        const score = Number(item.score.toFixed(2));
        const severity: 'low' | 'medium' | 'high' =
          item.maxCategoryWeight >= 4.5 && uniqueReporters >= 2
            ? 'high'
            : score >= 4
              ? 'medium'
              : 'low';
        const autoHideSuggested =
          item.type === 'post' &&
          item.maxCategoryWeight >= 4.5 &&
          uniqueReporters >= 3 &&
          score >= 7;
        const typeLabel =
          item.type === 'post'
            ? 'Post'
            : item.type === 'comment'
              ? 'Comment'
              : 'User';

        return {
          type: item.type,
          targetId: item.targetId,
          title: `${typeLabel} reported for ${topCategory ?? 'other'}`,
          topCategory: topCategory ?? 'other',
          categories,
          topReason: topCategory ?? 'other',
          otherReasonCount,
          totalReports: item.totalReports,
          uniqueReporters,
          score,
          severity,
          autoHideSuggested,
          lastReportedAt: item.lastReportedAt,
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.lastReportedAt.getTime() - a.lastReportedAt.getTime();
      });

    const reportQueueLimit = 5;
    const seededByType: typeof queue = [];
    const seenKeys = new Set<string>();

    (['post', 'comment', 'user'] as const).forEach((type) => {
      const firstByType = queue.find((item) => item.type === type);
      if (!firstByType) return;
      const key = `${firstByType.type}:${firstByType.targetId}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      seededByType.push(firstByType);
    });

    const remaining = queue.filter((item) => {
      const key = `${item.type}:${item.targetId}`;
      return !seenKeys.has(key);
    });

    const reportQueue = [...seededByType, ...remaining].slice(0, reportQueueLimit);
    const openReportsCount = queue.length;
    const highRiskCount = queue.filter(
      (item) => item.severity === 'high' || item.autoHideSuggested,
    ).length;
    const medianScore = queue.length
      ? (() => {
          const scores = queue.map((item) => item.score).sort((a, b) => a - b);
          const mid = Math.floor(scores.length / 2);
          if (scores.length % 2 === 0) {
            return Number(((scores[mid - 1] + scores[mid]) / 2).toFixed(2));
          }
          return Number(scores[mid].toFixed(2));
        })()
      : null;

    return {
      openReportsCount,
      highRiskCount,
      medianScore,
      reportQueue,
    };
  }

  private async getReporterWeights(
    reporterIds: string[],
    since7d: Date,
  ): Promise<Map<string, number>> {
    if (!reporterIds.length) return new Map();

    const [postCounts, commentCounts, userCounts] = await Promise.all([
      this.reportPostModel
        .aggregate([
          {
            $match: {
              createdAt: { $gte: since7d },
              status: { $ne: 'resolved' },
            },
          },
          { $group: { _id: '$reporterId', count: { $sum: 1 } } },
        ])
        .exec(),
      this.reportCommentModel
        .aggregate([
          {
            $match: {
              createdAt: { $gte: since7d },
              status: { $ne: 'resolved' },
            },
          },
          { $group: { _id: '$reporterId', count: { $sum: 1 } } },
        ])
        .exec(),
      this.reportUserModel
        .aggregate([
          {
            $match: {
              createdAt: { $gte: since7d },
              status: { $ne: 'resolved' },
            },
          },
          { $group: { _id: '$reporterId', count: { $sum: 1 } } },
        ])
        .exec(),
    ]);

    const reporterCounts = new Map<string, number>();
    const mergeCounts = (rows: Array<{ _id: unknown; count: number }>) => {
      rows.forEach((row) => {
        const key = row._id?.toString?.();
        if (!key) return;
        reporterCounts.set(key, (reporterCounts.get(key) ?? 0) + row.count);
      });
    };
    mergeCounts(postCounts);
    mergeCounts(commentCounts);
    mergeCounts(userCounts);

    const reporters = await this.userModel
      .find({ _id: { $in: reporterIds } })
      .select('createdAt isVerified status')
      .lean();

    const reporterMeta = new Map(
      reporters.map((user) => [user._id.toString(), user]),
    );

    const reporterWeights = new Map<string, number>();
    reporterIds.forEach((id) => {
      const meta = reporterMeta.get(id);
      const reportsLast7d = reporterCounts.get(id) ?? 0;
      reporterWeights.set(
        id,
        this.computeReporterWeight({
          createdAt: meta?.createdAt ?? null,
          isVerified: meta?.isVerified ?? false,
          status: meta?.status ?? 'active',
          reportsLast7d,
        }),
      );
    });

    return reporterWeights;
  }

  async getReportDetail(
    type: string,
    targetId: string,
  ): Promise<{
    targetId: string;
    score: number;
    uniqueReporters: number;
    topReason: string;
    categories: string[];
    categoryBreakdown: Array<{
      category: string;
      count: number;
      percent: number;
    }>;
    totalReports: number;
    velocity: {
      reportsLast1h: number;
      reportsLast24h: number;
      perHourLast24h: number;
    };
    reporterMix: {
      weightedAverage: number | null;
      highTrustCount: number;
      highTrustRatio: number | null;
    };
    moderationHistory: Array<{
      note: string | null;
      action: string;
      severity: 'low' | 'medium' | 'high' | null;
      moderatorDisplayName: string | null;
      moderatorUsername: string | null;
      moderatorEmail: string | null;
      resolvedAt: Date | null;
    }>;
    reporterSummary: Array<{
      reporterId: string;
      displayName: string | null;
      username: string | null;
      avatarUrl: string | null;
      trustWeight: number;
      reportsForTarget30d: number;
      latestReportAt: Date | null;
    }>;
    postPreview?: {
      authorDisplayName: string | null;
      authorUsername: string | null;
      authorAvatarUrl: string | null;
      content: string;
      media: Array<{ type: 'image' | 'video'; url: string }>;
      createdAt: Date | null;
      visibility: string;
    } | null;
    commentPreview?: {
      authorDisplayName: string | null;
      authorUsername: string | null;
      authorAvatarUrl: string | null;
      content: string;
      media: { type: 'image' | 'video'; url: string } | null;
      createdAt: Date | null;
      postId: string | null;
      postExcerpt: string | null;
      postMedia: Array<{ type: 'image' | 'video'; url: string }>;
      postCreatedAt: Date | null;
      postAuthorAvatarUrl: string | null;
      postAuthorUsername: string | null;
      postAuthorDisplayName: string | null;
    } | null;
    userPreview?: {
      displayName: string | null;
      username: string | null;
      avatarUrl: string | null;
      bio: string | null;
      location: string | null;
      workplace: string | null;
      joinedAt: Date | null;
      status: string | null;
      stats: {
        postsCount: number;
        followersCount: number;
        followingCount: number;
      } | null;
    } | null;
    latestModeration?: {
      note: string | null;
      action: string;
      severity: 'low' | 'medium' | 'high' | null;
      moderatorDisplayName: string | null;
      moderatorUsername: string | null;
      moderatorEmail: string | null;
      resolvedAt: Date | null;
    } | null;
  }> {
    const now = Date.now();
    const since1h = new Date(now - 60 * 60 * 1000);
    const since24h = new Date(now - 24 * 60 * 60 * 1000);
    const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const normalizedType =
      type === 'comment' || type === 'user' ? type : 'post';
    const targetObjectId = Types.ObjectId.isValid(targetId)
      ? new Types.ObjectId(targetId)
      : null;

    const reports =
      normalizedType === 'post'
        ? await this.reportPostModel
            .find({
              postId: targetId,
              createdAt: { $gte: since30d },
              status: { $ne: 'resolved' },
            })
            .select('reporterId category createdAt')
            .lean()
        : normalizedType === 'comment'
          ? await this.reportCommentModel
              .find({
                commentId: targetId,
                createdAt: { $gte: since30d },
                status: { $ne: 'resolved' },
              })
              .select('reporterId category createdAt')
              .lean()
          : await this.reportUserModel
              .find({
                targetUserId: targetId,
                createdAt: { $gte: since30d },
                status: { $ne: 'resolved' },
              })
              .select('reporterId category createdAt')
              .lean();

    const reporterIds = Array.from(
      new Set(
        reports
          .map((report) => report.reporterId?.toString?.())
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const reporterWeights = await this.getReporterWeights(reporterIds, since7d);

    const categoryCounts: Record<string, number> = {};
    let scoreTotal = 0;
    reports.forEach((report) => {
      const reporterId = report.reporterId?.toString?.() ?? 'unknown';
      const weight = reporterWeights.get(reporterId) ?? 0.5;
      const category = report.category || 'other';
      const categoryWeight = this.getCategoryWeight(category);
      scoreTotal += weight * categoryWeight;
      categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
    });

    const categoryEntries = Object.entries(categoryCounts).sort(
      (a, b) => b[1] - a[1],
    );
    const topReason = categoryEntries[0]?.[0] ?? 'other';
    const categories = categoryEntries.map(([category]) => category);
    const categoryBreakdown = categoryEntries.map(([category, count]) => ({
      category,
      count,
      percent: reports.length
        ? Number(((count / reports.length) * 100).toFixed(1))
        : 0,
    }));

    const reportsLast1h = reports.filter((report) => {
      if (!report.createdAt) return false;
      const createdAt = new Date(report.createdAt).getTime();
      return Number.isFinite(createdAt) && createdAt >= since1h.getTime();
    }).length;
    const reportsLast24h = reports.filter((report) => {
      if (!report.createdAt) return false;
      const createdAt = new Date(report.createdAt).getTime();
      return Number.isFinite(createdAt) && createdAt >= since24h.getTime();
    }).length;

    const reporterWeightsList = reporterIds
      .map((id) => reporterWeights.get(id))
      .filter((weight): weight is number => typeof weight === 'number');
    const weightedAverage = reporterWeightsList.length
      ? Number(
          (
            reporterWeightsList.reduce((sum, weight) => sum + weight, 0) /
            reporterWeightsList.length
          ).toFixed(2),
        )
      : null;
    const highTrustCount = reporterWeightsList.filter(
      (weight) => weight >= 0.8,
    ).length;
    const highTrustRatio = reporterWeightsList.length
      ? Number(((highTrustCount / reporterWeightsList.length) * 100).toFixed(1))
      : null;

    const reporterActivity = new Map<
      string,
      { reportsForTarget30d: number; latestReportAt: Date | null }
    >();
    reports.forEach((report) => {
      const reporterId = report.reporterId?.toString?.();
      if (!reporterId) return;
      const existing = reporterActivity.get(reporterId);
      const createdAt = report.createdAt ? new Date(report.createdAt) : null;
      if (!existing) {
        reporterActivity.set(reporterId, {
          reportsForTarget30d: 1,
          latestReportAt: createdAt,
        });
        return;
      }
      existing.reportsForTarget30d += 1;
      if (
        createdAt &&
        (!existing.latestReportAt || createdAt > existing.latestReportAt)
      ) {
        existing.latestReportAt = createdAt;
      }
    });

    const reporterObjectIds = reporterIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const [reporterProfiles, reporterUsers] = reporterObjectIds.length
      ? await Promise.all([
          this.profileModel
            .find({ userId: { $in: reporterObjectIds } })
            .select('userId displayName username avatarUrl')
            .lean(),
          this.userModel
            .find({ _id: { $in: reporterObjectIds } })
            .select('_id email recentAccounts')
            .lean(),
        ])
      : [[], []];

    const reporterProfileMap = new Map(
      reporterProfiles.map((profile) => [profile.userId.toString(), profile]),
    );
    const reporterUserMap = new Map(
      reporterUsers.map((user) => [user._id.toString(), user]),
    );

    const reporterSummary = reporterIds
      .map((reporterId) => {
        const profile = reporterProfileMap.get(reporterId);
        const user = reporterUserMap.get(reporterId);
        const recentAccounts = (user?.recentAccounts ?? []).filter(
          (account) => account && (account.username || account.displayName),
        );
        const fallbackAccount = recentAccounts.sort((a, b) => {
          const aTime = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
          const bTime = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
          return bTime - aTime;
        })[0];
        const emailHandle = user?.email?.split('@')[0] ?? null;
        const activity = reporterActivity.get(reporterId);

        return {
          reporterId,
          displayName: profile?.displayName ?? fallbackAccount?.displayName ?? null,
          username:
            profile?.username ??
            fallbackAccount?.username ??
            emailHandle ??
            null,
          avatarUrl: profile?.avatarUrl ?? fallbackAccount?.avatarUrl ?? null,
          trustWeight: reporterWeights.get(reporterId) ?? 0.5,
          reportsForTarget30d: activity?.reportsForTarget30d ?? 0,
          latestReportAt: activity?.latestReportAt ?? null,
        };
      })
      .sort((a, b) => {
        if (b.reportsForTarget30d !== a.reportsForTarget30d) {
          return b.reportsForTarget30d - a.reportsForTarget30d;
        }
        const aTime = a.latestReportAt ? a.latestReportAt.getTime() : 0;
        const bTime = b.latestReportAt ? b.latestReportAt.getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 5);

    const postPreview =
      normalizedType === 'post'
        ? await (async () => {
            const post = await this.postModel
              .findById(targetId)
              .select('authorId content media createdAt visibility')
              .lean();
            if (!post) return null;
            const profile = await this.profileModel
              .findOne({ userId: post.authorId })
              .select('displayName username avatarUrl')
              .lean();

            return {
              authorDisplayName: profile?.displayName ?? null,
              authorUsername: profile?.username ?? null,
              authorAvatarUrl: profile?.avatarUrl ?? null,
              content: post.content ?? '',
              media: (post.media ?? []).map((item) => ({
                type: item.type,
                url: item.url,
              })),
              createdAt: post.createdAt ?? null,
              visibility: post.visibility ?? 'public',
            };
          })()
        : null;

    const commentPreview =
      normalizedType === 'comment'
        ? await (async () => {
            const comment = await this.commentModel
              .findById(targetId)
              .select('authorId content media createdAt postId')
              .lean();
            if (!comment) return null;

            const authorProfile = await this.profileModel
              .findOne({ userId: comment.authorId })
              .select('displayName username avatarUrl')
              .lean();

            const post = await this.postModel
              .findById(comment.postId)
              .select('authorId content media createdAt')
              .lean();
            const postAuthorProfile = post?.authorId
              ? await this.profileModel
                  .findOne({ userId: post.authorId })
                  .select('displayName username avatarUrl')
                  .lean()
              : null;

            return {
              authorDisplayName: authorProfile?.displayName ?? null,
              authorUsername: authorProfile?.username ?? null,
              authorAvatarUrl: authorProfile?.avatarUrl ?? null,
              content: comment.content ?? '',
              media: comment.media
                ? { type: comment.media.type, url: comment.media.url }
                : null,
              createdAt: comment.createdAt ?? null,
              postId: comment.postId?.toString?.() ?? null,
              postExcerpt: post?.content ?? null,
              postMedia: (post?.media ?? []).map((item) => ({
                type: item.type,
                url: item.url,
              })),
              postCreatedAt: post?.createdAt ?? null,
              postAuthorAvatarUrl: postAuthorProfile?.avatarUrl ?? null,
              postAuthorUsername: postAuthorProfile?.username ?? null,
              postAuthorDisplayName: postAuthorProfile?.displayName ?? null,
            };
          })()
        : null;

    const userPreview =
      normalizedType === 'user'
        ? await (async () => {
            const userId = Types.ObjectId.isValid(targetId)
              ? new Types.ObjectId(targetId)
              : null;
            const [profileById, user] = await Promise.all([
              userId
                ? this.profileModel
                    .findOne({ userId })
                    .select(
                      'displayName username avatarUrl bio location workplace stats',
                    )
                    .lean()
                : null,
              this.userModel
                .findById(targetId)
                .select(
                  'createdAt status email recentAccounts followerCount followingCount',
                )
                .lean(),
            ]);
            const profile =
              profileById ||
              (await this.profileModel
                .findOne({ userId: targetId as any })
                .select(
                  'displayName username avatarUrl bio location workplace stats',
                )
                .lean());

            if (!profile && !user) return null;

            const recentAccounts = (user?.recentAccounts ?? []).filter(
              (account) => account && (account.username || account.displayName),
            );
            const fallbackAccount = recentAccounts.sort((a, b) => {
              const aTime = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
              const bTime = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
              return bTime - aTime;
            })[0];
            const emailHandle = user?.email?.split('@')[0] ?? null;
            const displayName =
              profile?.displayName ?? fallbackAccount?.displayName ?? null;
            const username =
              profile?.username ?? fallbackAccount?.username ?? emailHandle;
            const avatarUrl =
              profile?.avatarUrl ?? fallbackAccount?.avatarUrl ?? null;

            const profileStats = profile?.stats;
            const fallbackPostsCount = userId
              ? await this.postModel
                  .countDocuments({
                    authorId: userId,
                    deletedAt: null,
                    repostOf: null,
                    kind: { $in: ['post', 'reel'] },
                  })
                  .exec()
              : 0;
            const fallbackFollowersCount = user?.followerCount ?? 0;
            const fallbackFollowingCount = user?.followingCount ?? 0;

            return {
              displayName,
              username,
              avatarUrl,
              bio: profile?.bio ?? null,
              location: profile?.location ?? null,
              workplace: profile?.workplace?.companyName ?? null,
              joinedAt: user?.createdAt ?? null,
              status: user?.status ?? null,
              stats: {
                postsCount: profileStats?.postsCount ?? fallbackPostsCount,
                followersCount:
                  profileStats?.followersCount ?? fallbackFollowersCount,
                followingCount:
                  profileStats?.followingCount ?? fallbackFollowingCount,
              },
            };
          })()
        : null;

    const moderationHistory = targetObjectId
      ? await this.moderationActionModel
          .find({
            targetType: normalizedType,
            targetId: targetObjectId,
          })
          .sort({ createdAt: -1 })
          .limit(10)
          .select('action severity note moderatorId createdAt')
          .lean()
      : [];

    const moderatorObjectIds = Array.from(
      new Set(
        moderationHistory
          .map((item) => item.moderatorId)
          .filter((id): id is Types.ObjectId => Boolean(id)),
      ),
    );

    const [moderatorProfiles, moderatorUsers] = moderatorObjectIds.length
      ? await Promise.all([
          this.profileModel
            .find({ userId: { $in: moderatorObjectIds } })
            .select('userId displayName username')
            .lean(),
          this.userModel
            .find({ _id: { $in: moderatorObjectIds } })
            .select('_id email')
            .lean(),
        ])
      : [[], []];

    const moderatorProfileMap = new Map(
      moderatorProfiles.map((profile) => [profile.userId.toString(), profile]),
    );
    const moderatorUserMap = new Map(
      moderatorUsers.map((user) => [user._id.toString(), user]),
    );

    const moderationHistoryItems = moderationHistory.map((item) => {
      const moderatorId = item.moderatorId?.toString?.() ?? '';
      const moderatorProfile = moderatorProfileMap.get(moderatorId);
      const moderatorUser = moderatorUserMap.get(moderatorId);
      return {
        note: item.note ?? null,
        action: item.action,
        severity: item.severity ?? null,
        moderatorDisplayName: moderatorProfile?.displayName ?? null,
        moderatorUsername: moderatorProfile?.username ?? null,
        moderatorEmail: moderatorUser?.email ?? null,
        resolvedAt: item.createdAt ?? null,
      };
    });

    const latestModeration = moderationHistoryItems[0] ?? null;

    return {
      targetId,
      score: Number(scoreTotal.toFixed(2)),
      uniqueReporters: reporterIds.length,
      topReason,
      categories,
      categoryBreakdown,
      totalReports: reports.length,
      velocity: {
        reportsLast1h,
        reportsLast24h,
        perHourLast24h: Number((reportsLast24h / 24).toFixed(2)),
      },
      reporterMix: {
        weightedAverage,
        highTrustCount,
        highTrustRatio,
      },
      moderationHistory: moderationHistoryItems,
      reporterSummary,
      postPreview,
      commentPreview,
      userPreview,
      latestModeration,
    };
  }

  async getStats(): Promise<{
    totalUsers: number;
    postsCreated: number;
    newUsers24h: number;
    newUsersPrev24h: number;
    newUsersDeltaPct: number | null;
    postsCreated7d: number;
    postsCreatedPrev7d: number;
    postsCreatedDeltaPct: number | null;
    storageUsedBytes: number;
    storageLimitBytes: number | null;
    storageUsedPct: number | null;
    realtimeRooms: number | null;
    realtimeParticipants: number | null;
    apiStatus: 'Operational' | 'Degraded' | 'Down';
    apiUptimeSeconds: number;
    openReportsCount: number;
    highRiskReportsCount: number;
    medianReportScore: number | null;
    reportQueue: Array<{
      type: 'post' | 'comment' | 'user';
      targetId: string;
      title: string;
      topCategory: string;
      categories: string[];
      topReason: string;
      otherReasonCount: number;
      totalReports: number;
      uniqueReporters: number;
      score: number;
      severity: 'low' | 'medium' | 'high';
      autoHideSuggested: boolean;
      lastReportedAt: Date;
    }>;
  }> {
    const now = Date.now();
    const since24h = new Date(now - 24 * 60 * 60 * 1000);
    const since48h = new Date(now - 48 * 60 * 60 * 1000);
    const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const since14d = new Date(now - 14 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      postsCreated,
      newUsers24h,
      newUsersPrev24h,
      postsCreated7d,
      postsCreatedPrev7d,
      storageUsage,
      realtimeStats,
      reportStats,
    ] = await Promise.all([
      this.userModel.countDocuments({}).exec(),
      this.postModel.countDocuments({ deletedAt: null }).exec(),
      this.userModel
        .countDocuments({
          status: 'active',
          signupStage: 'completed',
          createdAt: { $gte: since24h },
        })
        .exec(),
      this.userModel
        .countDocuments({
          status: 'active',
          signupStage: 'completed',
          createdAt: { $gte: since48h, $lt: since24h },
        })
        .exec(),
      this.postModel
        .countDocuments({
          deletedAt: null,
          createdAt: { $gte: since7d },
        })
        .exec(),
      this.postModel
        .countDocuments({
          deletedAt: null,
          createdAt: { $gte: since14d, $lt: since7d },
        })
        .exec(),
      this.cloudinary.getStorageUsage(),
      this.livekit.getRealtimeStats().catch(() => ({
        rooms: null,
        participants: null,
      })),
      this.getReportStats(),
    ]);

    const postsCreatedDeltaPct = postsCreatedPrev7d
      ? ((postsCreated7d - postsCreatedPrev7d) / postsCreatedPrev7d) * 100
      : null;
    const newUsersDeltaPct = newUsersPrev24h
      ? ((newUsers24h - newUsersPrev24h) / newUsersPrev24h) * 100
      : null;
    const storageUsedPct = storageUsage.limitBytes
      ? (storageUsage.usedBytes / storageUsage.limitBytes) * 100
      : null;
    const dbOperational = this.connection.readyState === 1;
    const apiStatus = dbOperational ? 'Operational' : 'Down';
    const apiUptimeSeconds = Math.floor(process.uptime());

    return {
      totalUsers,
      postsCreated,
      newUsers24h,
      newUsersPrev24h,
      newUsersDeltaPct,
      postsCreated7d,
      postsCreatedPrev7d,
      postsCreatedDeltaPct,
      storageUsedBytes: storageUsage.usedBytes,
      storageLimitBytes: storageUsage.limitBytes,
      storageUsedPct,
      realtimeRooms: realtimeStats.rooms,
      realtimeParticipants: realtimeStats.participants,
      apiStatus,
      apiUptimeSeconds,
      openReportsCount: reportStats.openReportsCount,
      highRiskReportsCount: reportStats.highRiskCount,
      medianReportScore: reportStats.medianScore,
      reportQueue: reportStats.reportQueue,
    };
  }

  async getMediaModerationQueue(limit = 20): Promise<{
    items: Array<{
      postId: string;
      authorDisplayName: string | null;
      authorUsername: string | null;
      createdAt: Date | null;
      visibility: string;
      kind: 'post' | 'reel';
      moderationDecision: 'approve' | 'blur' | 'reject';
      moderationProvider: string | null;
      moderatedMediaCount: number;
      previewUrl: string | null;
      reasons: string[];
    }>;
    counts: {
      approve: number;
      blur: number;
      reject: number;
    };
  }> {
    const safeLimit = Math.min(Math.max(limit, 1), 50);

    const docs = await this.postModel
      .find({
        deletedAt: null,
        'media.metadata.moderationDecision': { $in: ['approve', 'blur', 'reject'] },
      })
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .select('authorId createdAt visibility kind media')
      .lean();

    const authorIds = Array.from(
      new Set(
        docs
          .map((doc) => doc.authorId?.toString?.())
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const authorObjectIds = authorIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const profiles = authorObjectIds.length
      ? await this.profileModel
          .find({ userId: { $in: authorObjectIds } })
          .select('userId displayName username')
          .lean()
      : [];

    const profileMap = new Map(
      profiles.map((profile) => [profile.userId.toString(), profile]),
    );

    const counts = {
      approve: 0,
      blur: 0,
      reject: 0,
    };

    const items: Array<{
      postId: string;
      authorDisplayName: string | null;
      authorUsername: string | null;
      createdAt: Date | null;
      visibility: string;
      kind: 'post' | 'reel';
      moderationDecision: 'approve' | 'blur' | 'reject';
      moderationProvider: string | null;
      moderatedMediaCount: number;
      previewUrl: string | null;
      reasons: string[];
    }> = [];

    for (const doc of docs) {
      const media = Array.isArray(doc.media) ? doc.media : [];
      const moderated = media.filter((item: any) => {
        const decision = item?.metadata?.moderationDecision;
        return (
          decision === 'approve' || decision === 'blur' || decision === 'reject'
        );
      });

      if (!moderated.length) continue;

      const decisionRank: Record<'approve' | 'blur' | 'reject', number> = {
        approve: 1,
        blur: 2,
        reject: 3,
      };

      const primary = moderated
        .map((item: any) => ({
          decision: item?.metadata?.moderationDecision as
            | 'approve'
            | 'blur'
            | 'reject',
          provider:
            typeof item?.metadata?.moderationProvider === 'string'
              ? item.metadata.moderationProvider
              : null,
          reasons: Array.isArray(item?.metadata?.moderationReasons)
            ? item.metadata.moderationReasons.filter((x: any) => typeof x === 'string')
            : [],
          url: typeof item?.url === 'string' ? item.url : null,
        }))
        .sort((a, b) => decisionRank[b.decision] - decisionRank[a.decision])[0];

      counts[primary.decision] += 1;

      const profile = profileMap.get(doc.authorId?.toString?.() ?? '');

      items.push({
        postId: doc._id.toString(),
        authorDisplayName: profile?.displayName ?? null,
        authorUsername: profile?.username ?? null,
        createdAt: doc.createdAt ?? null,
        visibility: doc.visibility ?? 'public',
        kind: (doc.kind ?? 'post') as 'post' | 'reel',
        moderationDecision: primary.decision,
        moderationProvider: primary.provider,
        moderatedMediaCount: moderated.length,
        previewUrl: primary.url,
        reasons: primary.reasons,
      });
    }

    return { items, counts };
  }

  async getMediaModerationDetail(postId: string): Promise<{
    postId: string;
    content: string;
    createdAt: Date | null;
    visibility: string;
    kind: 'post' | 'reel';
    author: {
      displayName: string | null;
      username: string | null;
      avatarUrl: string | null;
    };
    media: Array<{
      index: number;
      type: 'image' | 'video';
      url: string;
      moderationDecision: 'approve' | 'blur' | 'reject' | 'unknown';
      moderationProvider: string | null;
      moderationReasons: string[];
      moderationScores: Record<string, number>;
    }>;
  }> {
    const doc = await this.postModel
      .findOne({ _id: postId, deletedAt: null })
      .select('authorId content createdAt visibility kind media')
      .lean();

    if (!doc) {
      throw new NotFoundException('Post not found');
    }

    const profile = await this.profileModel
      .findOne({ userId: doc.authorId })
      .select('displayName username avatarUrl')
      .lean();

    const mediaItems = (Array.isArray(doc.media) ? doc.media : []).map(
      (item: any, index: number) => {
        const rawDecision = item?.metadata?.moderationDecision;
        const moderationDecision: 'approve' | 'blur' | 'reject' | 'unknown' =
          rawDecision === 'approve' || rawDecision === 'blur' || rawDecision === 'reject'
            ? rawDecision
            : 'unknown';

        const rawScores =
          item?.metadata?.moderationScores &&
          typeof item.metadata.moderationScores === 'object'
            ? item.metadata.moderationScores
            : {};

        const moderationScores = Object.entries(rawScores).reduce(
          (acc, [key, value]) => {
            if (typeof value === 'number' && Number.isFinite(value)) {
              acc[key] = value;
            }
            return acc;
          },
          {} as Record<string, number>,
        );

        const mediaType: 'image' | 'video' =
          item?.type === 'video' ? 'video' : 'image';
        const moderationReasons: string[] = Array.isArray(
          item?.metadata?.moderationReasons,
        )
          ? item.metadata.moderationReasons.filter((x: any) => typeof x === 'string')
          : [];

        return {
          index,
          type: mediaType,
          url: typeof item?.url === 'string' ? item.url : '',
          moderationDecision,
          moderationProvider:
            typeof item?.metadata?.moderationProvider === 'string'
              ? item.metadata.moderationProvider
              : null,
          moderationReasons,
          moderationScores,
        };
      },
    );

    return {
      postId: doc._id.toString(),
      content: doc.content ?? '',
      createdAt: doc.createdAt ?? null,
      visibility: doc.visibility ?? 'public',
      kind: (doc.kind ?? 'post') as 'post' | 'reel',
      author: {
        displayName: profile?.displayName ?? null,
        username: profile?.username ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
      },
      media: mediaItems,
    };
  }

  async resolveReportAction(params: {
    type: string;
    targetId: string;
    action?:
      | 'no_violation'
      | 'remove_post'
      | 'restrict_post'
      | 'delete_comment'
      | 'warn'
      | 'mute_interaction'
      | 'suspend_user'
      | 'limit_account'
      | 'violation';
    category: string;
    reason: string;
    severity?: 'low' | 'medium' | 'high';
    muteDurationMinutes?: number;
    muteUntilTurnOn?: boolean;
    suspendDurationMinutes?: number;
    suspendUntilTurnOn?: boolean;
    limitDurationMinutes?: number;
    limitUntilTurnOn?: boolean;
    note?: string | null;
    adminId: string;
  }): Promise<{ status: 'ok' | 'already_resolved' }> {
    const {
      type,
      targetId,
      action,
      category,
      reason,
      severity,
      muteDurationMinutes,
      muteUntilTurnOn,
      suspendDurationMinutes,
      suspendUntilTurnOn,
      limitDurationMinutes,
      limitUntilTurnOn,
      note,
      adminId,
    } = params;
    const normalizedType =
      type === 'comment' || type === 'user' ? type : 'post';
    const resolvedAction =
      (action as
        | 'no_violation'
        | 'remove_post'
        | 'restrict_post'
        | 'delete_comment'
        | 'warn'
        | 'mute_interaction'
        | 'suspend_user'
        | 'limit_account'
        | 'violation'
        | undefined) ?? 'violation';

    const allowedActionsByType: Record<string, string[]> = {
      post: ['no_violation', 'remove_post', 'restrict_post', 'warn', 'violation'],
      comment: [
        'no_violation',
        'delete_comment',
        'warn',
        'mute_interaction',
        'violation',
      ],
      user: [
        'no_violation',
        'suspend_user',
        'limit_account',
        'warn',
        'mute_interaction',
        'violation',
      ],
    };

    if (!(allowedActionsByType[normalizedType] ?? []).includes(resolvedAction)) {
      throw new BadRequestException('Action is not allowed for this target type');
    }

    if (!Types.ObjectId.isValid(targetId)) {
      throw new BadRequestException('Invalid target id');
    }
    if (!category || !reason) {
      throw new BadRequestException('Category and reason are required');
    }
    if (
      !['no_violation', 'warn', 'mute_interaction', 'suspend_user'].includes(
        resolvedAction,
      ) &&
      (!severity || !['low', 'medium', 'high'].includes(severity))
    ) {
      throw new BadRequestException('Severity must be low, medium, or high');
    }

    if (resolvedAction === 'mute_interaction') {
      const hasDuration = Number.isFinite(muteDurationMinutes);
      const untilTurnOn = Boolean(muteUntilTurnOn);
      if (!hasDuration && !untilTurnOn) {
        throw new BadRequestException(
          'Mute interaction duration or until-turn-on mode is required',
        );
      }
      if (hasDuration) {
        const duration = Math.floor(Number(muteDurationMinutes));
        if (duration < 5 || duration > 43200) {
          throw new BadRequestException(
            'Mute interaction duration must be between 5 and 43200 minutes',
          );
        }
      }
    }

    if (resolvedAction === 'suspend_user') {
      const hasDuration = Number.isFinite(suspendDurationMinutes);
      const untilTurnOn = Boolean(suspendUntilTurnOn);
      if (!hasDuration && !untilTurnOn) {
        throw new BadRequestException(
          'Suspend duration or until-turn-on mode is required',
        );
      }
      if (hasDuration) {
        const duration = Math.floor(Number(suspendDurationMinutes));
        if (duration < 5 || duration > 43200) {
          throw new BadRequestException(
            'Suspend duration must be between 5 and 43200 minutes',
          );
        }
      }
    }

    if (resolvedAction === 'limit_account') {
      const hasDuration = Number.isFinite(limitDurationMinutes);
      const untilTurnOn = Boolean(limitUntilTurnOn);
      if (!hasDuration && !untilTurnOn) {
        throw new BadRequestException(
          'Limit account duration or until-turn-on mode is required',
        );
      }
      if (hasDuration) {
        const duration = Math.floor(Number(limitDurationMinutes));
        if (duration < 5 || duration > 43200) {
          throw new BadRequestException(
            'Limit account duration must be between 5 and 43200 minutes',
          );
        }
      }
    }

    const resolvedMuteDurationMinutes =
      resolvedAction === 'mute_interaction'
        ? Number.isFinite(muteDurationMinutes)
          ? Math.floor(Number(muteDurationMinutes))
          : null
        : null;
    const resolvedMuteUntilTurnOn =
      resolvedAction === 'mute_interaction' && !resolvedMuteDurationMinutes
        ? Boolean(muteUntilTurnOn)
        : false;
    const resolvedMuteExpiresAt =
      resolvedMuteDurationMinutes != null
        ? new Date(Date.now() + resolvedMuteDurationMinutes * 60 * 1000)
        : null;

    const resolvedSuspendDurationMinutes =
      resolvedAction === 'suspend_user'
        ? Number.isFinite(suspendDurationMinutes)
          ? Math.floor(Number(suspendDurationMinutes))
          : null
        : null;
    const resolvedSuspendUntilTurnOn =
      resolvedAction === 'suspend_user' && !resolvedSuspendDurationMinutes
        ? Boolean(suspendUntilTurnOn)
        : false;
    const resolvedSuspendExpiresAt =
      resolvedSuspendDurationMinutes != null
        ? new Date(Date.now() + resolvedSuspendDurationMinutes * 60 * 1000)
        : null;

    const resolvedLimitDurationMinutes =
      resolvedAction === 'limit_account'
        ? Number.isFinite(limitDurationMinutes)
          ? Math.floor(Number(limitDurationMinutes))
          : null
        : null;
    const resolvedLimitUntilTurnOn =
      resolvedAction === 'limit_account' && !resolvedLimitDurationMinutes
        ? Boolean(limitUntilTurnOn)
        : false;
    const resolvedLimitExpiresAt =
      resolvedLimitDurationMinutes != null
        ? new Date(Date.now() + resolvedLimitDurationMinutes * 60 * 1000)
        : null;
    const resolvedActionExpiresAt =
      resolvedAction === 'mute_interaction'
        ? resolvedMuteExpiresAt
        : resolvedAction === 'suspend_user'
          ? resolvedSuspendExpiresAt
        : resolvedAction === 'limit_account'
          ? resolvedLimitExpiresAt
          : null;

    const resolvedSeverity =
      ['no_violation', 'warn', 'mute_interaction', 'suspend_user'].includes(
        resolvedAction,
      )
        ? null
        : severity ?? null;

    const targetObjectId = new Types.ObjectId(targetId);
    const moderatorObjectId = new Types.ObjectId(adminId);
    const targetIdCandidates = [targetObjectId, targetId as any];

    const reporterObjectIds =
      normalizedType === 'post'
        ? await this.reportPostModel.distinct('reporterId', {
            postId: { $in: targetIdCandidates },
            status: { $ne: 'resolved' },
          })
        : normalizedType === 'comment'
          ? await this.reportCommentModel.distinct('reporterId', {
              commentId: { $in: targetIdCandidates },
              status: { $ne: 'resolved' },
            })
          : await this.reportUserModel.distinct('reporterId', {
              targetUserId: { $in: targetIdCandidates },
              status: { $ne: 'resolved' },
            });
    const reporterIds = Array.from(
      new Set(
        reporterObjectIds
          .map((id) => id?.toString?.())
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const openReportsCount =
      normalizedType === 'post'
        ? await this.reportPostModel
            .countDocuments({
              postId: { $in: targetIdCandidates },
              status: { $ne: 'resolved' },
            })
            .exec()
        : normalizedType === 'comment'
          ? await this.reportCommentModel
              .countDocuments({
                commentId: { $in: targetIdCandidates },
                status: { $ne: 'resolved' },
              })
              .exec()
          : await this.reportUserModel
              .countDocuments({
                targetUserId: { $in: targetIdCandidates },
                status: { $ne: 'resolved' },
              })
              .exec();

    if (openReportsCount === 0) {
      return { status: 'already_resolved' };
    }

    let offenderId: Types.ObjectId | null = null;
    let offenderEmail: string | null = null;
    if (normalizedType === 'post') {
      const post = await this.postModel
        .findById(targetObjectId)
        .select('authorId')
        .lean();
      if (!post?.authorId) {
        throw new NotFoundException('Post not found');
      }
      if (resolvedAction !== 'no_violation') {
        offenderId = new Types.ObjectId(post.authorId);
      }
    } else if (normalizedType === 'comment') {
      const comment = await this.commentModel
        .findById(targetObjectId)
        .select('authorId postId')
        .lean();
      if (!comment?.authorId) {
        throw new NotFoundException('Comment not found');
      }
      if (resolvedAction !== 'no_violation') {
        offenderId = new Types.ObjectId(comment.authorId);
      }
    } else {
      const user = await this.userModel
        .findById(targetObjectId)
        .select('_id email')
        .lean();
      if (!user?._id) {
        throw new NotFoundException('User not found');
      }
      if (resolvedAction !== 'no_violation') {
        offenderId = new Types.ObjectId(user._id);
        offenderEmail = typeof user.email === 'string' ? user.email : null;
      }
    }

    await this.moderationActionModel.create({
      targetType: normalizedType,
      targetId: targetObjectId,
      action: resolvedAction,
      category,
      reason,
      severity: resolvedSeverity,
      expiresAt: resolvedActionExpiresAt,
      note: note ?? null,
      moderatorId: moderatorObjectId,
    });

    if (normalizedType === 'post') {
      if (resolvedAction === 'remove_post') {
        await this.postModel
          .updateOne(
            { _id: targetObjectId },
            {
              $set: {
                moderationState: 'removed',
                deletedAt: new Date(),
                deletedBy: moderatorObjectId,
                deletedSource: 'admin',
                deletedReason: reason,
              },
            },
          )
          .exec();
      }
      if (resolvedAction === 'restrict_post') {
        await this.postModel
          .updateOne(
            { _id: targetObjectId },
            {
              $set: {
                moderationState: 'restricted',
                visibility: 'followers',
                deletedAt: null,
                deletedBy: null,
                deletedSource: null,
                deletedReason: null,
              },
            },
          )
          .exec();
      }
    }

    if (normalizedType === 'comment') {
      if (resolvedAction === 'delete_comment') {
        const commentInfo = await this.commentModel
          .findById(targetObjectId)
          .select('postId')
          .lean();

        if (!commentInfo?.postId) {
          throw new NotFoundException('Comment not found');
        }

        await this.commentsService.adminDeleteCommentForModeration({
          postId: commentInfo.postId.toString(),
          commentId: targetObjectId.toString(),
          moderatorId: moderatorObjectId.toString(),
          reason,
        });
      }
    }

    if (resolvedAction === 'mute_interaction' && offenderId && resolvedMuteExpiresAt) {
      await this.userModel
        .updateOne(
          { _id: offenderId },
          {
            $set: {
              interactionMutedUntil: resolvedMuteExpiresAt,
              interactionMutedIndefinitely: false,
            },
          },
        )
        .exec();
      await this.interactionMuteScheduler.scheduleUnmute(
        offenderId.toString(),
        resolvedMuteExpiresAt,
      );
    }

    if (resolvedAction === 'mute_interaction' && offenderId && resolvedMuteUntilTurnOn) {
      await this.userModel
        .updateOne(
          { _id: offenderId },
          {
            $set: {
              interactionMutedUntil: null,
              interactionMutedIndefinitely: true,
            },
          },
        )
        .exec();
    }

    if (normalizedType === 'user') {
      if (resolvedAction === 'suspend_user') {
        await this.userModel
          .updateOne(
            { _id: targetObjectId },
            {
              $set: {
                status: 'banned',
                accountLimitedUntil: null,
                accountLimitedIndefinitely: false,
                suspendedUntil: resolvedSuspendExpiresAt,
                suspendedIndefinitely: resolvedSuspendUntilTurnOn,
              },
            },
          )
          .exec();

        await this.usersService.logoutAllDevices({
          userId: targetObjectId.toString(),
        });

        this.notificationsService.emitForceLogout(
          targetObjectId.toString(),
          'suspended',
        );

        if (offenderEmail) {
          await this.mailService
            .sendAccountBannedEmail({
              email: offenderEmail,
              reason,
              moderatorNote: note,
            })
            .catch(() => undefined);
        }
      }
      if (resolvedAction === 'limit_account') {
        await this.userModel
          .updateOne(
            { _id: targetObjectId },
            {
              $set: {
                status: 'pending',
                accountLimitedUntil: resolvedLimitExpiresAt,
                accountLimitedIndefinitely: resolvedLimitUntilTurnOn,
                suspendedUntil: null,
                suspendedIndefinitely: false,
              },
            },
          )
          .exec();
      }
    }

    const resolvedPayload = {
      status: 'resolved',
      resolvedAction,
      resolvedCategory: category,
      resolvedReason: reason,
      resolvedSeverity,
      resolvedNote: note ?? null,
      resolvedBy: moderatorObjectId,
      resolvedAt: new Date(),
    };

    const strikeIncrement =
      ['warn', 'mute_interaction'].includes(resolvedAction)
        ? 0
        : resolvedAction === 'suspend_user'
          ? 3
        : resolvedSeverity === 'high'
          ? 3
          : resolvedSeverity === 'medium'
            ? 2
            : 1;
    let strikeTotalAfter: number | null = null;

    if (normalizedType === 'post') {
      await this.reportPostModel
        .updateMany(
          {
            postId: { $in: targetIdCandidates },
            status: { $ne: 'resolved' },
          },
          resolvedPayload,
        )
        .exec();
    } else if (normalizedType === 'comment') {
      await this.reportCommentModel
        .updateMany(
          {
            commentId: { $in: targetIdCandidates },
            status: { $ne: 'resolved' },
          },
          resolvedPayload,
        )
        .exec();
    } else {
      await this.reportUserModel
        .updateMany(
          {
            targetUserId: { $in: targetIdCandidates },
            status: { $ne: 'resolved' },
          },
          resolvedPayload,
        )
        .exec();
    }

    if (resolvedAction !== 'no_violation' && offenderId && strikeIncrement > 0) {
      const offender = await this.userModel
        .findOneAndUpdate(
          { _id: offenderId },
          { $inc: { strikeCount: strikeIncrement } },
          { new: true },
        )
        .select('strikeCount')
        .lean()
        .exec();
      strikeTotalAfter =
        typeof offender?.strikeCount === 'number' ? offender.strikeCount : null;
    }

    if (
      resolvedAction !== 'no_violation' &&
      offenderId &&
      strikeIncrement === 0 &&
      strikeTotalAfter == null
    ) {
      const offender = await this.userModel
        .findById(offenderId)
        .select('strikeCount')
        .lean()
        .exec();
      strikeTotalAfter =
        typeof offender?.strikeCount === 'number' ? offender.strikeCount : null;
    }

    if (resolvedAction === 'no_violation' && reporterIds.length) {
      await Promise.allSettled(
        reporterIds.map((recipientId) =>
          this.notificationsService.createReportResolutionNotification({
            recipientId,
            outcome: 'no_violation',
            audience: 'reporter',
            targetType: normalizedType,
            action: resolvedAction,
          }),
        ),
      );
    }

    if (resolvedAction !== 'no_violation' && reporterIds.length) {
      await Promise.allSettled(
        reporterIds.map((recipientId) =>
          this.notificationsService.createReportResolutionNotification({
            recipientId,
            outcome: 'action_taken',
            audience: 'reporter',
            targetType: normalizedType,
            action: resolvedAction,
          }),
        ),
      );
    }

    if (resolvedAction === 'warn' && offenderId) {
      await this.notificationsService.createReportResolutionNotification({
        recipientId: offenderId.toString(),
        outcome: 'action_taken',
        audience: 'offender',
        targetType: normalizedType,
        action: resolvedAction,
        targetId,
        targetPostId: normalizedType === 'post' ? targetId : undefined,
        severity: null,
        strikeDelta: 0,
        strikeTotal: strikeTotalAfter,
        reason,
      });
    }

    if (
      normalizedType === 'comment' &&
      resolvedAction === 'delete_comment' &&
      offenderId
    ) {
      await this.notificationsService.createReportResolutionNotification({
        recipientId: offenderId.toString(),
        outcome: 'action_taken',
        audience: 'offender',
        targetType: normalizedType,
        action: resolvedAction,
        targetId,
        severity: resolvedSeverity,
        strikeDelta: strikeIncrement,
        strikeTotal: strikeTotalAfter,
        reason,
      });
    }

    if (
      normalizedType === 'comment' &&
      resolvedAction === 'violation' &&
      offenderId
    ) {
      await this.notificationsService.createReportResolutionNotification({
        recipientId: offenderId.toString(),
        outcome: 'action_taken',
        audience: 'offender',
        targetType: normalizedType,
        action: resolvedAction,
        targetId,
        severity: resolvedSeverity,
        strikeDelta: strikeIncrement,
        strikeTotal: strikeTotalAfter,
        reason,
      });
    }

    if (resolvedAction === 'mute_interaction' && offenderId) {
      await this.notificationsService.createReportResolutionNotification({
        recipientId: offenderId.toString(),
        outcome: 'action_taken',
        audience: 'offender',
        targetType: normalizedType,
        action: resolvedAction,
        targetId,
        severity: null,
        strikeDelta: 0,
        strikeTotal: strikeTotalAfter,
        reason,
        actionExpiresAt: resolvedActionExpiresAt,
      });
    }

    if (resolvedAction === 'limit_account' && offenderId) {
      await this.notificationsService.createReportResolutionNotification({
        recipientId: offenderId.toString(),
        outcome: 'action_taken',
        audience: 'offender',
        targetType: normalizedType,
        action: resolvedAction,
        targetId,
        severity: resolvedSeverity,
        strikeDelta: strikeIncrement,
        strikeTotal: strikeTotalAfter,
        reason,
        actionExpiresAt: resolvedActionExpiresAt,
      });
    }

    if (resolvedAction === 'suspend_user' && offenderId) {
      await this.notificationsService.createReportResolutionNotification({
        recipientId: offenderId.toString(),
        outcome: 'action_taken',
        audience: 'offender',
        targetType: normalizedType,
        action: resolvedAction,
        targetId,
        severity: resolvedSeverity,
        strikeDelta: strikeIncrement,
        strikeTotal: strikeTotalAfter,
        reason,
        actionExpiresAt: resolvedActionExpiresAt,
      });
    }

    if (
      normalizedType === 'post' &&
      ['remove_post', 'restrict_post'].includes(resolvedAction) &&
      offenderId
    ) {
      await this.notificationsService.createReportResolutionNotification({
        recipientId: offenderId.toString(),
        outcome: 'action_taken',
        audience: 'offender',
        targetType: 'post',
        action: resolvedAction,
        targetId,
        targetPostId: targetId,
        severity: resolvedSeverity,
        strikeDelta: strikeIncrement,
        strikeTotal: strikeTotalAfter,
        reason,
      });
    }

    return { status: 'ok' };
  }
}
