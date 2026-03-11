import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Comment } from '../comment/comment.schema';
import { Post } from '../posts/post.schema';
import { User } from '../users/user.schema';
import { ModerationAction } from '../moderation/moderation-action.schema';
import { CreateReportCommentDto } from './dto/create-reportcomment.dto';
import { ReportComment, ReportCommentReasons } from './reportcomment.schema';

@Injectable()
export class ReportCommentService {
  constructor(
    @InjectModel(ReportComment.name)
    private readonly reportCommentModel: Model<ReportComment>,
    @InjectModel(Comment.name)
    private readonly commentModel: Model<Comment>,
    @InjectModel(Post.name)
    private readonly postModel: Model<Post>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(ModerationAction.name)
    private readonly moderationActionModel: Model<ModerationAction>,
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

  private async resolveSystemModeratorId(
    fallbackUserId: string,
  ): Promise<Types.ObjectId> {
    const admin = await this.userModel
      .findOne({ roles: 'admin' })
      .select('_id')
      .lean();
    if (admin?._id) {
      return new Types.ObjectId(admin._id);
    }
    if (Types.ObjectId.isValid(fallbackUserId)) {
      return new Types.ObjectId(fallbackUserId);
    }
    throw new BadRequestException('Cannot resolve system moderator identity');
  }

  private async evaluateAndAutoHideComment(params: {
    commentId: string;
    fallbackModeratorId: string;
  }): Promise<void> {
    const { commentId, fallbackModeratorId } = params;
    const comment = await this.commentModel
      .findById(commentId)
      .select('moderationState autoHiddenPendingReview deletedAt')
      .lean();

    if (!comment) return;
    if (comment.deletedAt) return;
    if (comment.autoHiddenPendingReview) return;
    if (comment.moderationState === 'removed' || comment.moderationState === 'restricted') {
      return;
    }

    const now = Date.now();
    const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const since24h = new Date(now - 24 * 60 * 60 * 1000);
    const since1h = new Date(now - 60 * 60 * 1000);
    const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const reports = await this.reportCommentModel
      .find({
        commentId,
        createdAt: { $gte: since30d },
        status: { $ne: 'resolved' },
      })
      .select('reporterId category reason createdAt')
      .lean();

    if (!reports.length) return;

    const reporterIds = Array.from(
      new Set(
        reports
          .map((report) => report.reporterId?.toString?.())
          .filter((id): id is string => Boolean(id)),
      ),
    );
    if (!reporterIds.length) return;

    const reporterObjectIds = reporterIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    const [reporters, countsLast7d] = await Promise.all([
      this.userModel
        .find({ _id: { $in: reporterObjectIds } })
        .select('createdAt isVerified status')
        .lean(),
      this.reportCommentModel
        .aggregate([{ $match: { createdAt: { $gte: since7d }, status: { $ne: 'resolved' } } }, { $group: { _id: '$reporterId', count: { $sum: 1 } } }])
        .exec(),
    ]);

    const reporterMeta = new Map(
      reporters.map((user) => [user._id.toString(), user]),
    );
    const reportCountMap = new Map<string, number>();
    countsLast7d.forEach((row) => {
      const key = row._id?.toString?.();
      if (!key) return;
      reportCountMap.set(key, row.count ?? 0);
    });

    const reporterWeights = new Map<string, number>();
    let newUnverifiedCount = 0;
    reporterIds.forEach((reporterId) => {
      const meta = reporterMeta.get(reporterId);
      const ageDays = meta?.createdAt
        ? Math.floor((now - new Date(meta.createdAt).getTime()) / 86400000)
        : 0;
      if (ageDays < 7 && !meta?.isVerified) {
        newUnverifiedCount += 1;
      }

      reporterWeights.set(
        reporterId,
        this.computeReporterWeight({
          createdAt: meta?.createdAt ?? null,
          isVerified: meta?.isVerified ?? false,
          status: meta?.status ?? 'active',
          reportsLast7d: reportCountMap.get(reporterId) ?? 0,
        }),
      );
    });

    const totalReporterCount = reporterIds.length;
    if (!totalReporterCount) return;
    const newUnverifiedRatio = (newUnverifiedCount / totalReporterCount) * 100;
    if (newUnverifiedRatio > 60) {
      return;
    }

    const eligibleReports = reports.filter((report) => {
      const reporterId = report.reporterId?.toString?.() ?? '';
      const trustWeight = reporterWeights.get(reporterId) ?? 0;
      return trustWeight >= 0.6;
    });
    if (!eligibleReports.length) return;

    const eligibleReporterIds = Array.from(
      new Set(
        eligibleReports
          .map((report) => report.reporterId?.toString?.())
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const highTrustCount = eligibleReporterIds.filter(
      (id) => (reporterWeights.get(id) ?? 0) >= 0.8,
    ).length;
    const highTrustRatio = eligibleReporterIds.length
      ? (highTrustCount / eligibleReporterIds.length) * 100
      : 0;
    if (highTrustRatio < 40) {
      return;
    }

    const categoryCounts: Record<string, number> = {};
    const reasonReporterMap = new Map<string, Set<string>>();
    let weightedScore = 0;
    let reportsLast1h = 0;
    let reportsLast24h = 0;

    eligibleReports.forEach((report) => {
      const reporterId = report.reporterId?.toString?.() ?? '';
      const category = report.category || 'other';
      const reason = report.reason || 'other';
      const trustWeight = reporterWeights.get(reporterId) ?? 0.6;

      weightedScore += trustWeight * this.getCategoryWeight(category);
      categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;

      const reasonSet = reasonReporterMap.get(reason) ?? new Set<string>();
      reasonSet.add(reporterId);
      reasonReporterMap.set(reason, reasonSet);

      const createdAtMs = report.createdAt ? new Date(report.createdAt).getTime() : 0;
      if (createdAtMs >= since1h.getTime()) reportsLast1h += 1;
      if (createdAtMs >= since24h.getTime()) reportsLast24h += 1;
    });

    const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other';
    const severeTopCategory = ['violence', 'illegal', 'privacy', 'abuse'].includes(topCategory);

    const severeReasonCount = ['nonconsensual_intimate', 'self_harm', 'extremism']
      .map((reason) => reasonReporterMap.get(reason)?.size ?? 0)
      .reduce((max, count) => Math.max(max, count), 0);

    const score = Number(weightedScore.toFixed(2));
    const uniqueReporters = eligibleReporterIds.length;
    const meetsStandardRule =
      score >= 6.5 &&
      uniqueReporters >= 3 &&
      severeTopCategory &&
      (reportsLast1h >= 2 || reportsLast24h >= 4);
    const meetsCriticalRule =
      (score >= 9 && uniqueReporters >= 5) || severeReasonCount >= 2;

    if (!meetsStandardRule && !meetsCriticalRule) {
      return;
    }

    const hiddenAt = new Date();
    const hiddenUntil = new Date(hiddenAt.getTime() + 24 * 60 * 60 * 1000);
    const moderatorId = await this.resolveSystemModeratorId(fallbackModeratorId);
    const trigger = meetsCriticalRule ? 'critical-threshold' : 'standard-threshold';

    const updateResult = await this.commentModel
      .updateOne(
        { _id: commentId, autoHiddenPendingReview: { $ne: true }, deletedAt: null },
        {
          $set: {
            moderationState: 'hidden',
            autoHiddenPendingReview: true,
            autoHiddenAt: hiddenAt,
            autoHiddenUntil: hiddenUntil,
            autoHiddenEscalatedAt: null,
          },
        },
      )
      .exec();

    if (!updateResult.modifiedCount) {
      return;
    }

    await this.moderationActionModel.create({
      targetType: 'comment',
      targetId: new Types.ObjectId(commentId),
      action: 'auto_hidden_pending_review',
      category: topCategory,
      reason: 'auto_hide_rule_triggered',
      severity: 'high',
      note: `System auto-hide (${trigger}) for 24h pending admin review`,
      moderatorId,
      expiresAt: hiddenUntil,
    });
  }

  async create(
    reporterId: Types.ObjectId | string,
    commentId: string,
    dto: CreateReportCommentDto,
  ): Promise<ReportComment> {
    const reasonList = ReportCommentReasons[dto.category];
    if (!reasonList || !reasonList.includes(dto.reason)) {
      throw new BadRequestException('Invalid report reason');
    }

    if (!Types.ObjectId.isValid(commentId)) {
      throw new BadRequestException('Invalid commentId');
    }

    const comment = await this.commentModel
      .findOne({ _id: commentId, deletedAt: null })
      .select('_id postId')
      .lean();

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    const postId = comment.postId;

    const existing = await this.reportCommentModel.findOne({
      reporterId,
      commentId,
    });

    if (existing) {
      existing.category = dto.category;
      existing.reason = dto.reason;
      existing.note = dto.note ?? null;
      const saved = await existing.save();
      await this.evaluateAndAutoHideComment({
        commentId,
        fallbackModeratorId: reporterId.toString(),
      });
      return saved;
    }

    const created = await this.reportCommentModel.create({
      reporterId,
      commentId,
      postId,
      category: dto.category,
      reason: dto.reason,
      note: dto.note ?? null,
    });

    await this.postModel.updateOne(
      { _id: postId },
      { $inc: { 'stats.reports': 1 } },
    );

    await this.evaluateAndAutoHideComment({
      commentId,
      fallbackModeratorId: reporterId.toString(),
    });

    return created;
  }
}
