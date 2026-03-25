import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { User } from '../users/user.schema';
import { Post } from '../posts/post.schema';
import { PostInteraction } from '../posts/post-interaction.schema';
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
import { PaymentTransaction } from '../payments/payment-transaction.schema';
import {
  AdEngagementEvent,
  AdEngagementEventType,
} from '../payments/ad-engagement-event.schema';

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
    @InjectModel(PostInteraction.name)
    private readonly postInteractionModel: Model<PostInteraction>,
    @InjectModel(PaymentTransaction.name)
    private readonly paymentTransactionModel: Model<PaymentTransaction>,
    @InjectModel(AdEngagementEvent.name)
    private readonly adEngagementEventModel: Model<AdEngagementEvent>,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly commentsService: CommentsService,
    private readonly interactionMuteScheduler: InteractionMuteSchedulerService,
    private readonly cloudinary: CloudinaryService,
    private readonly livekit: LivekitService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  private async getAdsRevenueStats(params: {
    since: Date;
    now: Date;
  }): Promise<{
    adsGrossRevenue30d: number;
    adsSpend30d: number;
    adsActiveCampaigns: number;
    adsImpressions30d: number;
    adsClicks30d: number;
    adsCtr30dPct: number | null;
  }> {
    const { since, now } = params;

    const paidWindowQuery = {
      promotedPostId: { $ne: null },
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
            { paidAt: { $gte: since, $lte: now } },
            { paidAt: null, createdAt: { $gte: since, $lte: now } },
          ],
        },
      ],
    };

    const activeCampaignQuery = {
      promotedPostId: { $ne: null },
      $or: [
        { paymentStatus: 'paid' },
        { paymentStatus: 'no_payment_required' },
        { checkoutStatus: 'complete' },
      ],
      $and: [
        {
          $or: [{ hiddenReason: null }, { hiddenReason: { $nin: ['canceled', 'paused'] } }],
        },
        {
          $or: [{ isExpiredHidden: { $ne: true } }, { isExpiredHidden: null }],
        },
        {
          $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
        },
      ],
    };

    const adEventCounts = await this.adEngagementEventModel
      .aggregate([
        {
          $match: {
            createdAt: { $gte: since, $lte: now },
            eventType: { $in: ['impression', 'cta_click'] as AdEngagementEventType[] },
          },
        },
        {
          $group: {
            _id: '$eventType',
            count: { $sum: 1 },
          },
        },
      ])
      .exec();

    const [paidWindowRows, activeCampaigns] = await Promise.all([
      this.paymentTransactionModel
        .aggregate([
          { $match: paidWindowQuery },
          {
            $group: {
              _id: null,
              totalAmount: { $sum: '$amountTotal' },
            },
          },
        ])
        .exec(),
      this.paymentTransactionModel.countDocuments(activeCampaignQuery).exec(),
    ]);

    const adEventMap = new Map<string, number>();
    adEventCounts.forEach((row: { _id?: string; count?: number }) => {
      if (!row?._id) return;
      adEventMap.set(row._id, row.count ?? 0);
    });

    const adsImpressions30d = adEventMap.get('impression') ?? 0;
    const adsClicks30d = adEventMap.get('cta_click') ?? 0;
    const adsGrossRevenue30d = Number(paidWindowRows?.[0]?.totalAmount ?? 0);
    const adsSpend30d = adsGrossRevenue30d;
    const adsCtr30dPct =
      adsImpressions30d > 0 ? (adsClicks30d / adsImpressions30d) * 100 : null;

    return {
      adsGrossRevenue30d,
      adsSpend30d,
      adsActiveCampaigns: activeCampaigns,
      adsImpressions30d,
      adsClicks30d,
      adsCtr30dPct,
    };
  }

  private getCampaignLifecycleStatus(
    tx: Pick<PaymentTransaction, 'isExpiredHidden' | 'hiddenReason' | 'expiresAt'>,
    now: Date,
  ): 'active' | 'hidden' | 'canceled' | 'completed' {
    if (tx.hiddenReason === 'canceled') return 'canceled';
    if (tx.hiddenReason === 'paused') return 'hidden';

    const expiresAt = tx.expiresAt ? new Date(tx.expiresAt) : null;
    if (tx.isExpiredHidden || (expiresAt && expiresAt.getTime() <= now.getTime())) {
      return 'completed';
    }

    return 'active';
  }

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

  private async getAvgReportReviewMinutes(
    since: Date,
  ): Promise<number | null> {
    const buildPipeline = () => [
      {
        $match: {
          status: 'resolved',
          createdAt: { $ne: null },
          resolvedAt: { $ne: null, $gte: since },
        },
      },
      {
        $project: {
          durationMs: { $subtract: ['$resolvedAt', '$createdAt'] },
        },
      },
      {
        $match: {
          durationMs: { $gte: 0 },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalMs: { $sum: '$durationMs' },
        },
      },
    ];

    const [postAgg, commentAgg, userAgg] = await Promise.all([
      this.reportPostModel.aggregate(buildPipeline()).exec(),
      this.reportCommentModel.aggregate(buildPipeline()).exec(),
      this.reportUserModel.aggregate(buildPipeline()).exec(),
    ]);

    const merged = [postAgg[0], commentAgg[0], userAgg[0]].filter(Boolean) as Array<{
      count?: number;
      totalMs?: number;
    }>;

    const totalCount = merged.reduce((sum, row) => sum + (row.count ?? 0), 0);
    const totalMs = merged.reduce((sum, row) => sum + (row.totalMs ?? 0), 0);

    if (!totalCount || !Number.isFinite(totalMs)) {
      return null;
    }

    return Number((totalMs / totalCount / 60000).toFixed(1));
  }

  private getStrikeIncrement(
    action: string,
    severity: 'low' | 'medium' | 'high' | null,
  ): number {
    if (
      [
        'warn',
        'mute_interaction',
        'no_violation',
        'creator_verification_approved',
        'creator_verification_rejected',
        'creator_verification_revoked',
        'cancel_ads_campaign',
        'reopen_ads_campaign',
      ].includes(action)
    ) {
      return 0;
    }
    if (action === 'suspend_user') {
      return 3;
    }
    if (severity === 'high') return 3;
    if (severity === 'medium') return 2;
    return 1;
  }

  private parseAdCreativeContent(content?: string | null): {
    primaryText: string;
    headline: string;
    adDescription: string;
    destinationUrl: string;
    cta: string;
  } | null {
    const raw = (content ?? '').replace(/\r/g, '').trim();
    if (!raw) {
      return null;
    }

    const extractBlock = (name: string) => {
      const pattern = new RegExp(
        `\\[\\[AD_${name}\\]\\]([\\s\\S]*?)\\[\\[\\/AD_${name}\\]\\]`,
        'i',
      );
      const matched = pattern.exec(raw);
      if (!matched) return '';
      return matched[1]?.replace(/^\n+|\n+$/g, '').trim() ?? '';
    };

    const structuredPrimaryText = extractBlock('PRIMARY_TEXT');
    const structuredHeadline = extractBlock('HEADLINE');
    const structuredDescription = extractBlock('DESCRIPTION');
    const structuredDestinationUrl = extractBlock('URL');
    const structuredCta = extractBlock('CTA');

    if (
      structuredPrimaryText ||
      structuredHeadline ||
      structuredDescription ||
      structuredDestinationUrl ||
      structuredCta
    ) {
      return {
        primaryText: structuredPrimaryText,
        headline: structuredHeadline,
        adDescription: structuredDescription,
        destinationUrl: structuredDestinationUrl,
        cta: structuredCta,
      };
    }

    // Legacy plain-text ad drafts: first lines are text blocks, optional CTA line, optional trailing URL.
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      return null;
    }

    let destinationUrl = '';
    const last = lines[lines.length - 1];
    if (/^https?:\/\//i.test(last)) {
      destinationUrl = last;
      lines.pop();
    }

    let cta = '';
    const metaLines: string[] = [];
    lines.forEach((line) => {
      const matched = /^cta\s*:\s*(.+)$/i.exec(line);
      if (matched && !cta) {
        cta = matched[1]?.trim() ?? '';
        return;
      }
      metaLines.push(line);
    });

    return {
      primaryText: metaLines[0] ?? '',
      headline: metaLines.length > 1 ? metaLines[1] : '',
      adDescription: metaLines.length > 2 ? metaLines.slice(2).join(' ') : '',
      destinationUrl,
      cta,
    };
  }

  private getModerationDisplayContent(content?: string | null): string {
    const raw = typeof content === 'string' ? content : '';
    if (!raw) return '';

    const parsedCreative = this.parseAdCreativeContent(raw);
    if (!parsedCreative) {
      return raw;
    }

    const sections = [
      parsedCreative.primaryText,
      parsedCreative.headline,
      parsedCreative.adDescription,
      parsedCreative.cta ? `CTA: ${parsedCreative.cta}` : '',
      parsedCreative.destinationUrl,
    ].filter((value) => Boolean(value));

    if (!sections.length) {
      return raw;
    }

    return sections.join('\n');
  }

  private async resolveOffenderIdByTarget(params: {
    targetType: 'post' | 'comment' | 'user';
    targetId: Types.ObjectId;
  }): Promise<Types.ObjectId | null> {
    const { targetType, targetId } = params;
    if (targetType === 'post') {
      const post = await this.postModel.findById(targetId).select('authorId').lean();
      return post?.authorId ? new Types.ObjectId(post.authorId) : null;
    }

    if (targetType === 'comment') {
      const comment = await this.commentModel
        .findById(targetId)
        .select('authorId')
        .lean();
      return comment?.authorId ? new Types.ObjectId(comment.authorId) : null;
    }

    return new Types.ObjectId(targetId);
  }

  private async revertModerationActionEffects(params: {
    targetType: 'post' | 'comment' | 'user';
    targetId: Types.ObjectId;
    action: string;
    severity: 'low' | 'medium' | 'high' | null;
  }): Promise<void> {
    const { targetType, targetId, action, severity } = params;

    if (targetType === 'post') {
      if (action === 'remove_post' || action === 'restrict_post') {
        await this.postModel
          .updateOne(
            { _id: targetId },
            {
              $set: {
                moderationState: 'normal',
                deletedAt: null,
                deletedBy: null,
                deletedSource: null,
                deletedReason: null,
                autoHiddenPendingReview: false,
                autoHiddenAt: null,
                autoHiddenUntil: null,
                autoHiddenEscalatedAt: null,
              },
            },
          )
          .exec();
      }
    }

    if (targetType === 'comment') {
      if (action === 'delete_comment') {
        await this.commentModel
          .updateOne(
            { _id: targetId },
            {
              $set: {
                moderationState: 'normal',
                deletedAt: null,
                deletedBy: null,
                deletedSource: null,
                deletedReason: null,
                autoHiddenPendingReview: false,
                autoHiddenAt: null,
                autoHiddenUntil: null,
                autoHiddenEscalatedAt: null,
              },
            },
          )
          .exec();
      }
    }

    if (targetType === 'user') {
      if (action === 'suspend_user') {
        await this.userModel
          .updateOne(
            { _id: targetId },
            {
              $set: {
                status: 'active',
                suspendedUntil: null,
                suspendedIndefinitely: false,
              },
            },
          )
          .exec();
      }

      if (action === 'limit_account') {
        await this.userModel
          .updateOne(
            { _id: targetId },
            {
              $set: {
                status: 'active',
                accountLimitedUntil: null,
                accountLimitedIndefinitely: false,
              },
            },
          )
          .exec();
      }
    }

    if (action === 'mute_interaction') {
      const offenderId = await this.resolveOffenderIdByTarget({
        targetType,
        targetId,
      });
      if (offenderId) {
        await this.userModel
          .updateOne(
            { _id: offenderId },
            {
              $set: {
                interactionMutedUntil: null,
                interactionMutedIndefinitely: false,
              },
            },
          )
          .exec();
      }
    }

    const strikeDelta = this.getStrikeIncrement(action, severity);
    if (strikeDelta > 0) {
      const offenderId = await this.resolveOffenderIdByTarget({
        targetType,
        targetId,
      });
      if (offenderId) {
        const offender = await this.userModel
          .findById(offenderId)
          .select('strikeCount')
          .lean();
        const nextStrike = Math.max(0, (offender?.strikeCount ?? 0) - strikeDelta);
        await this.userModel
          .updateOne({ _id: offenderId }, { $set: { strikeCount: nextStrike } })
          .exec();
      }
    }
  }

  async getResolvedReports(params?: {
    type?: string;
    limit?: number;
  }): Promise<{
    items: Array<{
      actionId: string;
      type: 'post' | 'comment' | 'user';
      targetId: string;
      targetLabel: string;
      action: string;
      category: string;
      reason: string;
      severity: 'low' | 'medium' | 'high' | null;
      note: string | null;
      expiresAt: Date | null;
      resolvedAt: Date | null;
      moderatorDisplayName: string | null;
      moderatorUsername: string | null;
      moderatorEmail: string | null;
      penaltyActive: boolean;
      rollbackSupported: boolean;
    }>;
  }> {
    const normalizedType =
      params?.type === 'post' || params?.type === 'comment' || params?.type === 'user'
        ? params.type
        : null;
    const safeLimit = Math.min(Math.max(params?.limit ?? 80, 1), 200);

    const query: Record<string, unknown> = {
      invalidatedAt: null,
      action: {
        $in: [
          'no_violation',
          'remove_post',
          'restrict_post',
          'delete_comment',
          'warn',
          'mute_interaction',
          'suspend_user',
          'limit_account',
          'violation',
        ],
      },
    };
    if (normalizedType) {
      query.targetType = normalizedType;
    }

    const actions = await this.moderationActionModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .select(
        '_id targetType targetId action category reason severity note expiresAt moderatorId createdAt',
      )
      .lean();

    const [resolvedPostTargetIds, resolvedCommentTargetIds, resolvedUserTargetIds] =
      await Promise.all([
        normalizedType && normalizedType !== 'post'
          ? Promise.resolve<Array<Types.ObjectId | string>>([])
          : this.reportPostModel
              .distinct('postId', { status: 'resolved' })
              .exec(),
        normalizedType && normalizedType !== 'comment'
          ? Promise.resolve<Array<Types.ObjectId | string>>([])
          : this.reportCommentModel
              .distinct('commentId', { status: 'resolved' })
              .exec(),
        normalizedType && normalizedType !== 'user'
          ? Promise.resolve<Array<Types.ObjectId | string>>([])
          : this.reportUserModel
              .distinct('targetUserId', { status: 'resolved' })
              .exec(),
      ]);

    const resolvedPostTargetSet = new Set(
      resolvedPostTargetIds
        .filter((id) => id)
        .map((id) => id.toString()),
    );
    const resolvedCommentTargetSet = new Set(
      resolvedCommentTargetIds
        .filter((id) => id)
        .map((id) => id.toString()),
    );
    const resolvedUserTargetSet = new Set(
      resolvedUserTargetIds
        .filter((id) => id)
        .map((id) => id.toString()),
    );

    const resolvedActions = actions.filter((item) => {
      const key = item.targetId?.toString?.() ?? '';
      if (!key) return false;
      if (item.targetType === 'post') return resolvedPostTargetSet.has(key);
      if (item.targetType === 'comment') return resolvedCommentTargetSet.has(key);
      return resolvedUserTargetSet.has(key);
    });

    const moderatorIds = Array.from(
      new Set(
        resolvedActions.map((item) => item.moderatorId?.toString?.()).filter(Boolean),
      ),
    )
      .filter((id): id is string => Boolean(id))
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const [moderatorProfiles, moderatorUsers] = moderatorIds.length
      ? await Promise.all([
          this.profileModel
            .find({ userId: { $in: moderatorIds } })
            .select('userId displayName username')
            .lean(),
          this.userModel
            .find({ _id: { $in: moderatorIds } })
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

    const postIds = resolvedActions
      .filter((item) => item.targetType === 'post')
      .map((item) => item.targetId)
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id.toString()));
    const commentIds = resolvedActions
      .filter((item) => item.targetType === 'comment')
      .map((item) => item.targetId)
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id.toString()));
    const userIds = resolvedActions
      .filter((item) => item.targetType === 'user')
      .map((item) => item.targetId)
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id.toString()));

    type ResolvedPostDoc = {
      _id: Types.ObjectId;
      authorId?: Types.ObjectId | null;
      content?: string | null;
      moderationState?: string | null;
      deletedAt?: Date | null;
    };
    type ResolvedCommentDoc = {
      _id: Types.ObjectId;
      authorId?: Types.ObjectId | null;
      content?: string | null;
      moderationState?: string | null;
      deletedAt?: Date | null;
    };
    type ResolvedUserDoc = {
      _id: Types.ObjectId;
      status?: string | null;
      interactionMutedUntil?: Date | null;
      interactionMutedIndefinitely?: boolean;
      accountLimitedUntil?: Date | null;
      accountLimitedIndefinitely?: boolean;
      suspendedUntil?: Date | null;
      suspendedIndefinitely?: boolean;
    };
    type ResolvedUserProfileDoc = {
      userId: Types.ObjectId;
      displayName?: string | null;
      username?: string | null;
    };
    type ResolvedPostAuthorProfileDoc = {
      userId: Types.ObjectId;
      displayName?: string | null;
      username?: string | null;
    };
    type ResolvedCommentAuthorProfileDoc = {
      userId: Types.ObjectId;
      displayName?: string | null;
      username?: string | null;
    };

    const [posts, comments, users, userProfiles]: [
      ResolvedPostDoc[],
      ResolvedCommentDoc[],
      ResolvedUserDoc[],
      ResolvedUserProfileDoc[],
    ] = await Promise.all([
      postIds.length
        ? this.postModel
            .find({ _id: { $in: postIds } })
            .select('_id authorId content moderationState deletedAt')
            .lean<ResolvedPostDoc[]>()
            .exec()
        : Promise.resolve<ResolvedPostDoc[]>([]),
      commentIds.length
        ? this.commentModel
            .find({ _id: { $in: commentIds } })
            .select('_id authorId content moderationState deletedAt')
            .lean<ResolvedCommentDoc[]>()
            .exec()
        : Promise.resolve<ResolvedCommentDoc[]>([]),
      userIds.length
        ? this.userModel
            .find({ _id: { $in: userIds } })
            .select('_id status interactionMutedUntil interactionMutedIndefinitely accountLimitedUntil accountLimitedIndefinitely suspendedUntil suspendedIndefinitely')
            .lean<ResolvedUserDoc[]>()
            .exec()
        : Promise.resolve<ResolvedUserDoc[]>([]),
      userIds.length
        ? this.profileModel
            .find({ userId: { $in: userIds } })
            .select('userId displayName username')
            .lean<ResolvedUserProfileDoc[]>()
            .exec()
        : Promise.resolve<ResolvedUserProfileDoc[]>([]),
    ]);

    const postMap = new Map<string, ResolvedPostDoc>(
      posts.map((item): [string, ResolvedPostDoc] => [item._id.toString(), item]),
    );
    const commentMap = new Map<string, ResolvedCommentDoc>(
      comments.map(
        (item): [string, ResolvedCommentDoc] => [item._id.toString(), item],
      ),
    );
    const userMap = new Map<string, ResolvedUserDoc>(
      users.map((item): [string, ResolvedUserDoc] => [item._id.toString(), item]),
    );
    const userProfileMap = new Map<string, ResolvedUserProfileDoc>(
      userProfiles.map(
        (item): [string, ResolvedUserProfileDoc] => [item.userId.toString(), item],
      ),
    );

    const postAuthorIds = Array.from(
      new Set(posts.map((item) => item.authorId?.toString?.()).filter(Boolean)),
    )
      .filter((id): id is string => Boolean(id))
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const postAuthorProfiles = postAuthorIds.length
      ? await this.profileModel
          .find({ userId: { $in: postAuthorIds } })
          .select('userId displayName username')
          .lean<ResolvedPostAuthorProfileDoc[]>()
          .exec()
      : [];

    const postAuthorProfileMap = new Map<string, ResolvedPostAuthorProfileDoc>(
      postAuthorProfiles.map((item) => [item.userId.toString(), item]),
    );

    const commentAuthorIds = Array.from(
      new Set(comments.map((item) => item.authorId?.toString?.()).filter(Boolean)),
    )
      .filter((id): id is string => Boolean(id))
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const commentAuthorProfiles = commentAuthorIds.length
      ? await this.profileModel
          .find({ userId: { $in: commentAuthorIds } })
          .select('userId displayName username')
          .lean<ResolvedCommentAuthorProfileDoc[]>()
          .exec()
      : [];

    const commentAuthorProfileMap = new Map<string, ResolvedCommentAuthorProfileDoc>(
      commentAuthorProfiles.map((item) => [item.userId.toString(), item]),
    );

    const rollbackSupportedActions = new Set([
      'remove_post',
      'restrict_post',
      'delete_comment',
      'warn',
      'mute_interaction',
      'suspend_user',
      'limit_account',
      'violation',
    ]);

    const items = resolvedActions.map((item) => {
      const moderatorId = item.moderatorId?.toString?.() ?? '';
      const moderatorProfile = moderatorProfileMap.get(moderatorId);
      const moderatorUser = moderatorUserMap.get(moderatorId);

      let targetLabel = `${item.targetType} ${item.targetId.toString()}`;
      let penaltyActive = false;

      if (item.targetType === 'post') {
        const post = postMap.get(item.targetId.toString());
        const postAuthorId = post?.authorId?.toString?.() ?? '';
        const postAuthorProfile = postAuthorId
          ? postAuthorProfileMap.get(postAuthorId)
          : null;
        if (postAuthorProfile?.username) {
          targetLabel = `@${postAuthorProfile.username}`;
        } else if (postAuthorProfile?.displayName) {
          targetLabel = postAuthorProfile.displayName;
        } else if (post?.content?.trim()) {
          targetLabel = post.content.slice(0, 100);
        }
        if (item.action === 'remove_post') {
          penaltyActive = Boolean(post?.deletedAt || post?.moderationState === 'removed');
        } else if (item.action === 'restrict_post') {
          penaltyActive = post?.moderationState === 'restricted';
        }
      }

      if (item.targetType === 'comment') {
        const comment = commentMap.get(item.targetId.toString());
        const commentAuthorId = comment?.authorId?.toString?.() ?? '';
        const commentAuthorProfile = commentAuthorId
          ? commentAuthorProfileMap.get(commentAuthorId)
          : null;
        if (commentAuthorProfile?.username) {
          targetLabel = `@${commentAuthorProfile.username}`;
        } else if (commentAuthorProfile?.displayName) {
          targetLabel = commentAuthorProfile.displayName;
        } else if (comment?.content?.trim()) {
          targetLabel = comment.content.slice(0, 100);
        }
        if (item.action === 'delete_comment') {
          penaltyActive = Boolean(
            comment?.deletedAt || comment?.moderationState === 'removed',
          );
        }
      }

      if (item.targetType === 'user') {
        const profile = userProfileMap.get(item.targetId.toString());
        const user = userMap.get(item.targetId.toString());
        targetLabel =
          (profile?.username ? `@${profile.username}` : null) ||
          profile?.displayName ||
          item.targetId.toString();
        if (item.action === 'suspend_user') {
          penaltyActive =
            user?.status === 'banned' ||
            Boolean(user?.suspendedIndefinitely) ||
            (user?.suspendedUntil ? new Date(user.suspendedUntil).getTime() > Date.now() : false);
        } else if (item.action === 'limit_account') {
          penaltyActive =
            user?.status === 'pending' ||
            Boolean(user?.accountLimitedIndefinitely) ||
            (user?.accountLimitedUntil
              ? new Date(user.accountLimitedUntil).getTime() > Date.now()
              : false);
        } else if (item.action === 'mute_interaction') {
          penaltyActive =
            Boolean(user?.interactionMutedIndefinitely) ||
            (user?.interactionMutedUntil
              ? new Date(user.interactionMutedUntil).getTime() > Date.now()
              : false);
        }
      }

      return {
        actionId: item._id.toString(),
        type: item.targetType,
        targetId: item.targetId.toString(),
        targetLabel,
        action: item.action,
        category: item.category,
        reason: item.reason,
        severity: item.severity ?? null,
        note: item.note ?? null,
        expiresAt: item.expiresAt ?? null,
        resolvedAt: item.createdAt ?? null,
        moderatorDisplayName: moderatorProfile?.displayName ?? null,
        moderatorUsername: moderatorProfile?.username ?? null,
        moderatorEmail: moderatorUser?.email ?? null,
        penaltyActive,
        rollbackSupported: rollbackSupportedActions.has(item.action),
      };
    });

    return { items };
  }

  async reopenResolvedCase(params: {
    type: string;
    targetId: string;
    note?: string | null;
    adminId: string;
  }): Promise<{ status: 'ok'; reopenedCount: number }> {
    const normalizedType =
      params.type === 'post' || params.type === 'comment' || params.type === 'user'
        ? params.type
        : null;
    if (!normalizedType) {
      throw new BadRequestException('Invalid target type');
    }
    if (!Types.ObjectId.isValid(params.targetId) || !Types.ObjectId.isValid(params.adminId)) {
      throw new BadRequestException('Invalid target/admin id');
    }

    const targetObjectId = new Types.ObjectId(params.targetId);
    const moderatorObjectId = new Types.ObjectId(params.adminId);

    const latestModerationAction = await this.moderationActionModel
      .findOne({
        targetType: normalizedType,
        targetId: targetObjectId,
        invalidatedAt: null,
        action: {
          $in: [
            'remove_post',
            'restrict_post',
            'delete_comment',
            'warn',
            'mute_interaction',
            'suspend_user',
            'limit_account',
            'violation',
          ],
        },
      })
      .sort({ createdAt: -1 })
      .select('_id targetType targetId action severity')
      .lean();

    if (latestModerationAction) {
      await this.revertModerationActionEffects({
        targetType: latestModerationAction.targetType,
        targetId: new Types.ObjectId(latestModerationAction.targetId),
        action: latestModerationAction.action,
        severity: latestModerationAction.severity ?? null,
      });

      await this.moderationActionModel
        .updateOne(
          { _id: latestModerationAction._id },
          {
            $set: {
              invalidatedAt: new Date(),
              invalidatedReason: 'reopen_replaced',
              invalidatedBy: moderatorObjectId,
            },
          },
        )
        .exec();
    }

    const reopenPayload = {
      status: 'open',
      resolvedAction: null,
      resolvedCategory: null,
      resolvedReason: null,
      resolvedSeverity: null,
      resolvedNote: null,
      resolvedBy: null,
      resolvedAt: null,
    };

    const concreteResult =
      normalizedType === 'post'
        ? await this.reportPostModel
            .updateMany(
              {
                postId: { $in: [targetObjectId, params.targetId as any] },
                status: 'resolved',
              },
              reopenPayload,
            )
            .exec()
        : normalizedType === 'comment'
          ? await this.reportCommentModel
              .updateMany(
                {
                  commentId: { $in: [targetObjectId, params.targetId as any] },
                  status: 'resolved',
                },
                reopenPayload,
              )
              .exec()
          : await this.reportUserModel
              .updateMany(
                {
                  targetUserId: { $in: [targetObjectId, params.targetId as any] },
                  status: 'resolved',
                },
                reopenPayload,
              )
              .exec();

    await this.moderationActionModel.create({
      targetType: normalizedType,
      targetId: targetObjectId,
      action: 'rollback_moderation',
      category: 'other',
      reason: 'reopen_case',
      severity: null,
      note: params.note ?? 'Case reopened for moderation review',
      moderatorId: moderatorObjectId,
      expiresAt: null,
    });

    return {
      status: 'ok',
      reopenedCount: concreteResult.modifiedCount ?? 0,
    };
  }

  async rollbackResolvedDecision(params: {
    actionId: string;
    note?: string | null;
    adminId: string;
  }): Promise<{ status: 'ok' }> {
    if (!Types.ObjectId.isValid(params.actionId) || !Types.ObjectId.isValid(params.adminId)) {
      throw new BadRequestException('Invalid action/admin id');
    }

    const moderationAction = await this.moderationActionModel
      .findById(params.actionId)
      .select('targetType targetId action severity')
      .lean();

    if (!moderationAction) {
      throw new NotFoundException('Moderation action not found');
    }

    if (
      ['auto_hidden_pending_review', 'no_violation', 'rollback_moderation'].includes(
        moderationAction.action,
      )
    ) {
      throw new BadRequestException('This moderation action cannot be rolled back');
    }

    const targetType = moderationAction.targetType;
    const targetId = new Types.ObjectId(moderationAction.targetId);
    const adminId = new Types.ObjectId(params.adminId);

    await this.revertModerationActionEffects({
      targetType,
      targetId,
      action: moderationAction.action,
      severity: moderationAction.severity ?? null,
    });

    await this.moderationActionModel.create({
      targetType,
      targetId,
      action: 'rollback_moderation',
      category: 'other',
      reason: 'rollback_moderation',
      severity: null,
      note:
        params.note ??
        `Rollback moderation action: ${moderationAction.action}`,
      moderatorId: adminId,
      expiresAt: null,
    });

    return { status: 'ok' };
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
      autoHiddenPendingReview: boolean;
      escalatedPriority: boolean;
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

    const baseQueue = Array.from(queueMap.values())
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
          autoHiddenPendingReview: false,
          escalatedPriority: false,
          lastReportedAt: item.lastReportedAt,
        };
      });

    const postTargetIds = baseQueue
      .filter((item) => item.type === 'post' && Types.ObjectId.isValid(item.targetId))
      .map((item) => new Types.ObjectId(item.targetId));
    const commentTargetIds = baseQueue
      .filter(
        (item) => item.type === 'comment' && Types.ObjectId.isValid(item.targetId),
      )
      .map((item) => new Types.ObjectId(item.targetId));

    type AutoHiddenTargetDoc = {
      _id: Types.ObjectId;
      autoHiddenPendingReview?: boolean | null;
      autoHiddenUntil?: Date | null;
      autoHiddenEscalatedAt?: Date | null;
    };

    const [postTargets, commentTargets]: [
      AutoHiddenTargetDoc[],
      AutoHiddenTargetDoc[],
    ] = await Promise.all([
      postTargetIds.length
        ? this.postModel
            .find({ _id: { $in: postTargetIds } })
            .select('_id autoHiddenPendingReview autoHiddenUntil autoHiddenEscalatedAt')
            .lean<AutoHiddenTargetDoc[]>()
            .exec()
        : Promise.resolve<AutoHiddenTargetDoc[]>([]),
      commentTargetIds.length
        ? this.commentModel
            .find({ _id: { $in: commentTargetIds } })
            .select('_id autoHiddenPendingReview autoHiddenUntil autoHiddenEscalatedAt')
            .lean<AutoHiddenTargetDoc[]>()
            .exec()
        : Promise.resolve<AutoHiddenTargetDoc[]>([]),
    ]);

    const postTargetMap = new Map<string, AutoHiddenTargetDoc>(
      postTargets.map(
        (target): [string, AutoHiddenTargetDoc] => [target._id.toString(), target],
      ),
    );
    const commentTargetMap = new Map<string, AutoHiddenTargetDoc>(
      commentTargets.map(
        (target): [string, AutoHiddenTargetDoc] => [target._id.toString(), target],
      ),
    );

    const nowDate = new Date();
    const escalatedPostIds: Types.ObjectId[] = [];
    const escalatedCommentIds: Types.ObjectId[] = [];

    const queue = baseQueue
      .map((item) => {
        if (item.type === 'user') {
          return item;
        }

        const target =
          item.type === 'post'
            ? postTargetMap.get(item.targetId)
            : commentTargetMap.get(item.targetId);
        const autoHiddenPendingReview = Boolean(target?.autoHiddenPendingReview);
        const hiddenUntilMs = target?.autoHiddenUntil
          ? new Date(target.autoHiddenUntil).getTime()
          : 0;
        const escalatedPriority =
          autoHiddenPendingReview &&
          Number.isFinite(hiddenUntilMs) &&
          hiddenUntilMs > 0 &&
          nowDate.getTime() > hiddenUntilMs;

        if (escalatedPriority && !target?.autoHiddenEscalatedAt) {
          if (item.type === 'post' && Types.ObjectId.isValid(item.targetId)) {
            escalatedPostIds.push(new Types.ObjectId(item.targetId));
          }
          if (item.type === 'comment' && Types.ObjectId.isValid(item.targetId)) {
            escalatedCommentIds.push(new Types.ObjectId(item.targetId));
          }
        }

        return {
          ...item,
          autoHiddenPendingReview,
          escalatedPriority,
        };
      })
      .sort((a, b) => {
        if (a.escalatedPriority !== b.escalatedPriority) {
          return a.escalatedPriority ? -1 : 1;
        }
        if (a.autoHiddenPendingReview !== b.autoHiddenPendingReview) {
          return a.autoHiddenPendingReview ? -1 : 1;
        }
        if (b.score !== a.score) return b.score - a.score;
        return b.lastReportedAt.getTime() - a.lastReportedAt.getTime();
      });

    if (escalatedPostIds.length) {
      await this.postModel
        .updateMany(
          {
            _id: { $in: escalatedPostIds },
            autoHiddenPendingReview: true,
            autoHiddenEscalatedAt: null,
          },
          { $set: { autoHiddenEscalatedAt: nowDate } },
        )
        .exec();
    }

    if (escalatedCommentIds.length) {
      await this.commentModel
        .updateMany(
          {
            _id: { $in: escalatedCommentIds },
            autoHiddenPendingReview: true,
            autoHiddenEscalatedAt: null,
          },
          { $set: { autoHiddenEscalatedAt: nowDate } },
        )
        .exec();
    }

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
      (item) =>
        item.severity === 'high' || item.autoHideSuggested || item.escalatedPriority,
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
      autoHiddenPendingReview?: boolean;
      autoHiddenAt?: Date | null;
      autoHiddenUntil?: Date | null;
      autoHiddenEscalatedAt?: Date | null;
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
      autoHiddenPendingReview?: boolean;
      autoHiddenAt?: Date | null;
      autoHiddenUntil?: Date | null;
      autoHiddenEscalatedAt?: Date | null;
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
    autoModeration?: {
      pendingReview: boolean;
      hiddenAt: Date | null;
      hiddenUntil: Date | null;
      escalatedPriority: boolean;
      escalatedAt: Date | null;
    };
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

    const reporterSummarySourceReports = reports.length
      ? reports
      : normalizedType === 'post'
        ? await this.reportPostModel
            .find({
              postId: targetId,
              createdAt: { $gte: since30d },
            })
            .select('reporterId category createdAt')
            .lean()
        : normalizedType === 'comment'
          ? await this.reportCommentModel
              .find({
                commentId: targetId,
                createdAt: { $gte: since30d },
              })
              .select('reporterId category createdAt')
              .lean()
          : await this.reportUserModel
              .find({
                targetUserId: targetId,
                createdAt: { $gte: since30d },
              })
              .select('reporterId category createdAt')
              .lean();

    const reporterSummaryReporterIds = Array.from(
      new Set(
        reporterSummarySourceReports
          .map((report) => report.reporterId?.toString?.())
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const reportsForSignals = reports.length
      ? reports
      : reporterSummarySourceReports;

    const reporterWeights = await this.getReporterWeights(
      reporterSummaryReporterIds,
      since7d,
    );

    const categoryCounts: Record<string, number> = {};
    let scoreTotal = 0;
    reportsForSignals.forEach((report) => {
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
      percent: reportsForSignals.length
        ? Number(((count / reportsForSignals.length) * 100).toFixed(1))
        : 0,
    }));

    const reportsLast1h = reportsForSignals.filter((report) => {
      if (!report.createdAt) return false;
      const createdAt = new Date(report.createdAt).getTime();
      return Number.isFinite(createdAt) && createdAt >= since1h.getTime();
    }).length;
    const reportsLast24h = reportsForSignals.filter((report) => {
      if (!report.createdAt) return false;
      const createdAt = new Date(report.createdAt).getTime();
      return Number.isFinite(createdAt) && createdAt >= since24h.getTime();
    }).length;

    const reporterIds = Array.from(
      new Set(
        reportsForSignals
          .map((report) => report.reporterId?.toString?.())
          .filter((id): id is string => Boolean(id)),
      ),
    );

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
    reporterSummarySourceReports.forEach((report) => {
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

    const reporterObjectIds = reporterSummaryReporterIds
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

    const reporterSummary = reporterSummaryReporterIds
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
              .select(
                'authorId content media createdAt visibility autoHiddenPendingReview autoHiddenAt autoHiddenUntil autoHiddenEscalatedAt',
              )
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
              autoHiddenPendingReview: Boolean(post.autoHiddenPendingReview),
              autoHiddenAt: post.autoHiddenAt ?? null,
              autoHiddenUntil: post.autoHiddenUntil ?? null,
              autoHiddenEscalatedAt: post.autoHiddenEscalatedAt ?? null,
            };
          })()
        : null;

    const commentPreview =
      normalizedType === 'comment'
        ? await (async () => {
            const comment = await this.commentModel
              .findById(targetId)
              .select(
                'authorId content media createdAt postId autoHiddenPendingReview autoHiddenAt autoHiddenUntil autoHiddenEscalatedAt',
              )
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
              autoHiddenPendingReview: Boolean(comment.autoHiddenPendingReview),
              autoHiddenAt: comment.autoHiddenAt ?? null,
              autoHiddenUntil: comment.autoHiddenUntil ?? null,
              autoHiddenEscalatedAt: comment.autoHiddenEscalatedAt ?? null,
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

    const autoHiddenSource =
      normalizedType === 'post'
        ? postPreview
        : normalizedType === 'comment'
          ? commentPreview
          : null;
    const hiddenUntilMs = autoHiddenSource?.autoHiddenUntil
      ? new Date(autoHiddenSource.autoHiddenUntil).getTime()
      : 0;
    const escalatedPriority =
      Boolean(autoHiddenSource?.autoHiddenPendingReview) &&
      Number.isFinite(hiddenUntilMs) &&
      hiddenUntilMs > 0 &&
      Date.now() > hiddenUntilMs;

    if (
      escalatedPriority &&
      autoHiddenSource?.autoHiddenPendingReview &&
      !autoHiddenSource?.autoHiddenEscalatedAt &&
      targetObjectId
    ) {
      if (normalizedType === 'post') {
        await this.postModel
          .updateOne(
            { _id: targetObjectId, autoHiddenEscalatedAt: null },
            { $set: { autoHiddenEscalatedAt: new Date() } },
          )
          .exec();
      }
      if (normalizedType === 'comment') {
        await this.commentModel
          .updateOne(
            { _id: targetObjectId, autoHiddenEscalatedAt: null },
            { $set: { autoHiddenEscalatedAt: new Date() } },
          )
          .exec();
      }
    }

    return {
      targetId,
      score: Number(scoreTotal.toFixed(2)),
      uniqueReporters: reporterIds.length,
      topReason,
      categories,
      categoryBreakdown,
      totalReports: reportsForSignals.length,
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
      autoModeration: {
        pendingReview: Boolean(autoHiddenSource?.autoHiddenPendingReview),
        hiddenAt: autoHiddenSource?.autoHiddenAt ?? null,
        hiddenUntil: autoHiddenSource?.autoHiddenUntil ?? null,
        escalatedPriority,
        escalatedAt: autoHiddenSource?.autoHiddenEscalatedAt ?? null,
      },
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
    adsGrossRevenue30d: number;
    adsSpend30d: number;
    adsActiveCampaigns: number;
    adsImpressions30d: number;
    adsClicks30d: number;
    adsCtr30dPct: number | null;
    medianReportScore: number | null;
    avgReportReviewMinutes: number | null;
    reviewSlaTargetMinutes: number;
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
      autoHiddenPendingReview: boolean;
      escalatedPriority: boolean;
      lastReportedAt: Date;
    }>;
  }> {
    const now = Date.now();
    const since24h = new Date(now - 24 * 60 * 60 * 1000);
    const since48h = new Date(now - 48 * 60 * 60 * 1000);
    const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const since14d = new Date(now - 14 * 24 * 60 * 60 * 1000);
    const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000);

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
      avgReportReviewMinutes,
      adsRevenueStats,
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
      this.getAvgReportReviewMinutes(since30d),
      this.getAdsRevenueStats({ since: since30d, now: new Date(now) }),
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
      adsGrossRevenue30d: adsRevenueStats.adsGrossRevenue30d,
      adsSpend30d: adsRevenueStats.adsSpend30d,
      adsActiveCampaigns: adsRevenueStats.adsActiveCampaigns,
      adsImpressions30d: adsRevenueStats.adsImpressions30d,
      adsClicks30d: adsRevenueStats.adsClicks30d,
      adsCtr30dPct:
        typeof adsRevenueStats.adsCtr30dPct === 'number'
          ? Number(adsRevenueStats.adsCtr30dPct.toFixed(2))
          : null,
      medianReportScore: reportStats.medianScore,
      avgReportReviewMinutes,
      reviewSlaTargetMinutes: 20,
      reportQueue: reportStats.reportQueue,
    };
  }

  async getAdsOverview(): Promise<{
    adsGrossRevenue30d: number;
    adsSpend30d: number;
    adsActiveCampaigns: number;
    adsImpressions30d: number;
    adsClicks30d: number;
    adsCtr30dPct: number | null;
    totalCampaigns: number;
    pausedCampaigns: number;
    canceledCampaigns: number;
    completedCampaigns: number;
  }> {
    const now = new Date();
    const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const baseCampaignQuery = {
      promotedPostId: { $ne: null },
    };

    const completedCampaignQuery = {
      ...baseCampaignQuery,
      hiddenReason: { $nin: ['paused', 'canceled'] },
      $or: [{ isExpiredHidden: true }, { expiresAt: { $lte: now } }],
    };

    const [adsRevenueStats, totalCampaigns, pausedCampaigns, canceledCampaigns, completedCampaigns] =
      await Promise.all([
        this.getAdsRevenueStats({ since: since30d, now }),
        this.paymentTransactionModel.countDocuments(baseCampaignQuery).exec(),
        this.paymentTransactionModel
          .countDocuments({ ...baseCampaignQuery, hiddenReason: 'paused' })
          .exec(),
        this.paymentTransactionModel
          .countDocuments({ ...baseCampaignQuery, hiddenReason: 'canceled' })
          .exec(),
        this.paymentTransactionModel.countDocuments(completedCampaignQuery).exec(),
      ]);

    return {
      adsGrossRevenue30d: adsRevenueStats.adsGrossRevenue30d,
      adsSpend30d: adsRevenueStats.adsSpend30d,
      adsActiveCampaigns: adsRevenueStats.adsActiveCampaigns,
      adsImpressions30d: adsRevenueStats.adsImpressions30d,
      adsClicks30d: adsRevenueStats.adsClicks30d,
      adsCtr30dPct:
        typeof adsRevenueStats.adsCtr30dPct === 'number'
          ? Number(adsRevenueStats.adsCtr30dPct.toFixed(2))
          : null,
      totalCampaigns,
      pausedCampaigns,
      canceledCampaigns,
      completedCampaigns,
    };
  }

  async getAdsCampaigns(params?: {
    q?: string;
    status?: 'all' | 'active' | 'hidden' | 'canceled' | 'completed';
    limit?: number;
    offset?: number;
  }): Promise<{
    items: Array<{
      campaignId: string;
      promotedPostId: string;
      campaignName: string;
      status: 'active' | 'hidden' | 'canceled' | 'completed';
      owner: {
        userId: string;
        displayName: string | null;
        username: string | null;
        avatarUrl: string | null;
      };
      createdAt: Date | null;
      startsAt: Date | null;
      expiresAt: Date | null;
      amountTotal: number;
      boostWeight: number;
      placement: string;
      paymentStatus: string | null;
      checkoutStatus: string | null;
      headline: string;
      primaryText: string;
      adDescription: string;
      ctaLabel: string;
      destinationUrl: string;
      post: {
        visibility: string;
        deleted: boolean;
      };
      metrics: {
        impressions: number;
        clicks: number;
        ctrPct: number | null;
        avgDwellSeconds: number | null;
      };
    }>;
    offset: number;
    limit: number;
    hasMore: boolean;
  }> {
    type CampaignPostLite = {
      _id: Types.ObjectId;
      content?: string | null;
      visibility?: string | null;
      deletedAt?: Date | null;
    };

    type CampaignEventAggRow = {
      _id?: {
        promotedPostId?: Types.ObjectId;
        eventType?: AdEngagementEventType;
      };
      count?: number;
      totalDurationMs?: number;
    };

    const safeLimit = Math.min(Math.max(params?.limit ?? 30, 1), 100);
    const safeOffset = Math.max(params?.offset ?? 0, 0);
    const statusFilter = params?.status ?? 'all';
    const q = (params?.q ?? '').trim();

    const query: Record<string, any> = {
      promotedPostId: { $ne: null },
    };

    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const orFilters: Array<Record<string, any>> = [
        { campaignName: regex },
        { promotedPostId: regex },
        { userId: regex },
        { sessionId: regex },
        { paymentIntentId: regex },
      ];

      const matchedProfiles = await this.profileModel
        .find({ $or: [{ username: regex }, { displayName: regex }] })
        .select('userId')
        .lean();

      const matchedUserIds = matchedProfiles
        .map((profile: any) => profile?.userId?.toString?.())
        .filter((id: any): id is string => Boolean(id));

      if (matchedUserIds.length) {
        orFilters.push({ userId: { $in: matchedUserIds } });
      }

      query.$or = orFilters;
    }

    const docs = await this.paymentTransactionModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(safeOffset)
      .limit(safeLimit + 1)
      .select(
        '_id userId promotedPostId campaignName isExpiredHidden hiddenReason expiresAt startsAt amountTotal boostWeight placement paymentStatus checkoutStatus adHeadline adPrimaryText adDescription ctaLabel destinationUrl createdAt',
      )
      .lean();

    const hasMoreRaw = docs.length > safeLimit;
    const slicedDocs = hasMoreRaw ? docs.slice(0, safeLimit) : docs;
    const now = new Date();

    const docsWithStatus = slicedDocs.map((doc: any) => ({
      ...doc,
      _status: this.getCampaignLifecycleStatus(doc, now),
    }));

    const filteredDocs =
      statusFilter === 'all'
        ? docsWithStatus
        : docsWithStatus.filter((doc: any) => doc._status === statusFilter);

    const userIds = Array.from(
      new Set(
        filteredDocs
          .map((doc: any) => String(doc.userId ?? ''))
          .filter((id: string) => id.length > 0),
      ),
    );

    const profileUserObjectIds = userIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const profiles = profileUserObjectIds.length
      ? await this.profileModel
          .find({ userId: { $in: profileUserObjectIds } })
          .select('userId displayName username avatarUrl')
          .lean()
      : [];

    const profileMap = new Map(
      profiles.map((profile: any) => [profile.userId.toString(), profile]),
    );

    const promotedPostIds = Array.from(
      new Set(
        filteredDocs
          .map((doc: any) => String(doc.promotedPostId ?? ''))
          .filter((id: string) => Types.ObjectId.isValid(id)),
      ),
    );

    const promotedPostObjectIds = promotedPostIds.map((id) => new Types.ObjectId(id));

    const [posts, eventRows]: [CampaignPostLite[], CampaignEventAggRow[]] =
      await Promise.all([
      promotedPostObjectIds.length
        ? (this.postModel
            .find({ _id: { $in: promotedPostObjectIds } })
            .select('_id content visibility deletedAt')
            .lean()
            .exec() as Promise<CampaignPostLite[]>)
        : Promise.resolve([]),
      promotedPostObjectIds.length
        ? (this.adEngagementEventModel
            .aggregate([
              {
                $match: {
                  promotedPostId: { $in: promotedPostObjectIds },
                  eventType: {
                    $in: ['impression', 'cta_click', 'dwell'] as AdEngagementEventType[],
                  },
                },
              },
              {
                $group: {
                  _id: {
                    promotedPostId: '$promotedPostId',
                    eventType: '$eventType',
                  },
                  count: { $sum: 1 },
                  totalDurationMs: {
                    $sum: {
                      $cond: [
                        { $eq: ['$eventType', 'dwell'] },
                        { $ifNull: ['$durationMs', 0] },
                        0,
                      ],
                    },
                  },
                },
              },
            ])
            .exec() as Promise<CampaignEventAggRow[]>)
        : Promise.resolve([]),
      ]);

    const postMap = new Map<string, CampaignPostLite>(
      posts.map((post) => [post._id.toString(), post] as [string, CampaignPostLite]),
    );

    const metricsMap = new Map<
      string,
      { impressions: number; clicks: number; dwellCount: number; dwellDurationMs: number }
    >();
    eventRows.forEach((row) => {
      const postId = row?._id?.promotedPostId?.toString?.();
      const eventType = row?._id?.eventType;
      if (!postId || !eventType) return;

      const current = metricsMap.get(postId) ?? {
        impressions: 0,
        clicks: 0,
        dwellCount: 0,
        dwellDurationMs: 0,
      };

      if (eventType === 'impression') {
        current.impressions = Number(row.count ?? 0);
      } else if (eventType === 'cta_click') {
        current.clicks = Number(row.count ?? 0);
      } else if (eventType === 'dwell') {
        current.dwellCount = Number(row.count ?? 0);
        current.dwellDurationMs = Number(row.totalDurationMs ?? 0);
      }

      metricsMap.set(postId, current);
    });

    const items = filteredDocs.map((doc: any) => {
      const userId = String(doc.userId ?? '');
      const promotedPostId = String(doc.promotedPostId ?? '');
      const profile = profileMap.get(userId);
      const promotedPost = postMap.get(promotedPostId);
      const parsedPostCreative = this.parseAdCreativeContent(promotedPost?.content);
      const metric = metricsMap.get(promotedPostId) ?? {
        impressions: 0,
        clicks: 0,
        dwellCount: 0,
        dwellDurationMs: 0,
      };

      const ctrPct =
        metric.impressions > 0
          ? Number(((metric.clicks / metric.impressions) * 100).toFixed(2))
          : null;
      const avgDwellSeconds =
        metric.dwellCount > 0
          ? Number((metric.dwellDurationMs / metric.dwellCount / 1000).toFixed(2))
          : null;

      return {
        campaignId: doc._id.toString(),
        promotedPostId,
        campaignName: doc.campaignName || 'Ads Campaign',
        status: doc._status,
        owner: {
          userId,
          displayName: profile?.displayName ?? null,
          username: profile?.username ?? null,
          avatarUrl: profile?.avatarUrl ?? null,
        },
        createdAt: doc.createdAt ?? null,
        startsAt: doc.startsAt ?? null,
        expiresAt: doc.expiresAt ?? null,
        amountTotal: Number(doc.amountTotal ?? 0),
        boostWeight: Number(doc.boostWeight ?? 0),
        placement: typeof doc.placement === 'string' ? doc.placement : 'home_feed',
        paymentStatus:
          typeof doc.paymentStatus === 'string' ? doc.paymentStatus : null,
        checkoutStatus:
          typeof doc.checkoutStatus === 'string' ? doc.checkoutStatus : null,
        headline:
          (typeof doc.adHeadline === 'string' && doc.adHeadline.trim()) ||
          parsedPostCreative?.headline ||
          '',
        primaryText:
          (typeof doc.adPrimaryText === 'string' && doc.adPrimaryText.trim()) ||
          parsedPostCreative?.primaryText ||
          '',
        adDescription:
          (typeof doc.adDescription === 'string' && doc.adDescription.trim()) ||
          parsedPostCreative?.adDescription ||
          '',
        ctaLabel:
          (typeof doc.ctaLabel === 'string' && doc.ctaLabel.trim()) ||
          parsedPostCreative?.cta ||
          '',
        destinationUrl:
          (typeof doc.destinationUrl === 'string' && doc.destinationUrl.trim()) ||
          parsedPostCreative?.destinationUrl ||
          '',
        post: {
          visibility:
            typeof promotedPost?.visibility === 'string'
              ? promotedPost.visibility
              : 'public',
          deleted: Boolean(promotedPost?.deletedAt),
        },
        metrics: {
          impressions: metric.impressions,
          clicks: metric.clicks,
          ctrPct,
          avgDwellSeconds,
        },
      };
    });

    return {
      items,
      offset: safeOffset,
      limit: safeLimit,
      hasMore: hasMoreRaw,
    };
  }

  async getAdsCampaignDetail(campaignId: string): Promise<{
    campaignId: string;
    promotedPostId: string;
    campaignName: string;
    status: 'active' | 'hidden' | 'canceled' | 'completed';
    owner: {
      userId: string;
      displayName: string | null;
      username: string | null;
      avatarUrl: string | null;
    };
    createdAt: Date | null;
    startsAt: Date | null;
    expiresAt: Date | null;
    amountTotal: number;
    boostWeight: number;
    placement: string;
    paymentStatus: string | null;
    checkoutStatus: string | null;
    objective: string;
    adFormat: string;
    primaryText: string;
    headline: string;
    adDescription: string;
    destinationUrl: string;
    ctaLabel: string;
    interests: string[];
    targetLocation: string;
    targetAgeMin: number | null;
    targetAgeMax: number | null;
    mediaUrls: string[];
    boostPackageId: string;
    durationPackageId: string;
    durationDays: number;
    hiddenReason: string | null;
    adminCancelReason: string | null;
    post: {
      visibility: string;
      deleted: boolean;
    };
    metrics: {
      impressions: number;
      reach: number;
      clicks: number;
      ctrPct: number | null;
      views: number;
      likes: number;
      comments: number;
      reposts: number;
      engagements: number;
      avgDwellSeconds: number | null;
      totalDwellSeconds: number;
      dwellSamples: number;
      engagementRatePct: number | null;
    };
    actions: {
      canCancel: boolean;
      canReopen: boolean;
    };
  }> {
    if (!Types.ObjectId.isValid(campaignId)) {
      throw new BadRequestException('Invalid campaignId');
    }

    const tx = await this.paymentTransactionModel
      .findOne({
        _id: new Types.ObjectId(campaignId),
        promotedPostId: { $ne: null },
      })
      .select(
        '_id userId promotedPostId campaignName isExpiredHidden hiddenReason adminCancelReason expiresAt startsAt amountTotal boostWeight placement paymentStatus checkoutStatus adHeadline adPrimaryText adDescription destinationUrl ctaLabel objective adFormat interests targetLocation targetAgeMin targetAgeMax mediaUrls boostPackageId durationPackageId durationDays createdAt paidAt',
      )
      .lean();

    if (!tx) {
      throw new NotFoundException('Campaign not found');
    }

    const userId = String(tx.userId ?? '');
    const promotedPostId = String(tx.promotedPostId ?? '');
    if (!Types.ObjectId.isValid(promotedPostId)) {
      throw new BadRequestException('Invalid promotedPostId');
    }
    const now = new Date();
    const startsAt = tx.startsAt ?? tx.paidAt ?? tx.createdAt ?? now;
    const expiresAt = tx.expiresAt ?? now;

    const profile = Types.ObjectId.isValid(userId)
      ? await this.profileModel
          .findOne({ userId: new Types.ObjectId(userId) })
          .select('displayName username avatarUrl')
          .lean()
      : null;

    const promotedPost = Types.ObjectId.isValid(promotedPostId)
      ? await this.postModel
          .findOne({ _id: new Types.ObjectId(promotedPostId) })
          .select('content media visibility deletedAt')
          .lean()
      : null;

    const parsedPostCreative = this.parseAdCreativeContent(promotedPost?.content);

    const postMediaUrls = Array.isArray(promotedPost?.media)
      ? promotedPost.media
          .map((item: { url?: string | null }) => item?.url?.toString?.() ?? '')
          .filter((url: string) => Boolean(url))
      : [];

    const related = Types.ObjectId.isValid(promotedPostId)
      ? await this.postModel
          .find({
            $or: [
              { _id: new Types.ObjectId(promotedPostId) },
              { repostOf: new Types.ObjectId(promotedPostId) },
            ],
            deletedAt: null,
          })
          .select('_id')
          .lean()
      : [];

    const relatedPostIds = related
      .map((item: { _id?: Types.ObjectId }) => item._id?.toString?.())
      .filter((id): id is string => Boolean(id));

    const [impressionCount, reachUserIds, ctaClickCount, dwellAgg, interactionAgg, viewUserIds, commentCount] =
      await Promise.all([
        this.adEngagementEventModel
          .countDocuments({
            promotedPostId: new Types.ObjectId(promotedPostId),
            eventType: 'impression',
            createdAt: { $gte: startsAt, $lte: expiresAt },
          })
          .exec(),
        this.adEngagementEventModel
          .distinct('userId', {
            promotedPostId: new Types.ObjectId(promotedPostId),
            eventType: 'impression',
            createdAt: { $gte: startsAt, $lte: expiresAt },
          })
          .exec(),
        this.adEngagementEventModel
          .countDocuments({
            promotedPostId: new Types.ObjectId(promotedPostId),
            eventType: 'cta_click',
            createdAt: { $gte: startsAt, $lte: expiresAt },
          })
          .exec(),
        this.adEngagementEventModel
          .aggregate([
            {
              $match: {
                promotedPostId: new Types.ObjectId(promotedPostId),
                eventType: 'dwell',
                durationMs: { $gt: 0 },
                createdAt: { $gte: startsAt, $lte: expiresAt },
              },
            },
            {
              $group: {
                _id: null,
                avgDurationMs: { $avg: '$durationMs' },
                totalDurationMs: { $sum: '$durationMs' },
                samples: { $sum: 1 },
              },
            },
          ])
          .exec(),
        relatedPostIds.length
          ? this.postInteractionModel
              .aggregate([
                {
                  $match: {
                    postId: {
                      $in: relatedPostIds.map((id) => new Types.ObjectId(id)),
                    },
                    type: { $in: ['like', 'repost'] },
                    createdAt: { $gte: startsAt, $lte: expiresAt },
                  },
                },
                {
                  $group: {
                    _id: '$type',
                    count: { $sum: 1 },
                  },
                },
              ])
              .exec()
          : Promise.resolve([]),
        relatedPostIds.length
          ? this.postInteractionModel
              .distinct('userId', {
                postId: {
                  $in: relatedPostIds.map((id) => new Types.ObjectId(id)),
                },
                type: 'view',
                createdAt: { $gte: startsAt, $lte: expiresAt },
              })
              .exec()
          : Promise.resolve([]),
        relatedPostIds.length
          ? this.commentModel
              .countDocuments({
                postId: {
                  $in: relatedPostIds.map((id) => new Types.ObjectId(id)),
                },
                deletedAt: null,
                createdAt: { $gte: startsAt, $lte: expiresAt },
              })
              .exec()
          : Promise.resolve(0),
      ]);

    const interactionMap = new Map<string, number>();
    (interactionAgg as Array<{ _id?: string; count?: number }>).forEach((row) => {
      if (!row?._id) return;
      interactionMap.set(row._id, row.count ?? 0);
    });

    const dwell = dwellAgg?.[0] as
      | { avgDurationMs?: number; totalDurationMs?: number; samples?: number }
      | undefined;
    const likes = interactionMap.get('like') ?? 0;
    const reposts = interactionMap.get('repost') ?? 0;
    const views = viewUserIds.length;
    const impressions = impressionCount ?? 0;
    const clicks = ctaClickCount ?? 0;
    const engagements = likes + commentCount + reposts;
    const ctrPct =
      impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : null;
    const engagementRatePct =
      impressions > 0
        ? Number(((engagements / impressions) * 100).toFixed(2))
        : null;

    const status = this.getCampaignLifecycleStatus(tx, now);

    return {
      campaignId: tx._id.toString(),
      promotedPostId,
      campaignName: tx.campaignName || 'Ads Campaign',
      status,
      owner: {
        userId,
        displayName: profile?.displayName ?? null,
        username: profile?.username ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
      },
      createdAt: tx.createdAt ?? null,
      startsAt,
      expiresAt,
      amountTotal: Number(tx.amountTotal ?? 0),
      boostWeight: Number(tx.boostWeight ?? 0),
      placement: typeof tx.placement === 'string' ? tx.placement : 'home_feed',
      paymentStatus: typeof tx.paymentStatus === 'string' ? tx.paymentStatus : null,
      checkoutStatus:
        typeof tx.checkoutStatus === 'string' ? tx.checkoutStatus : null,
      objective: tx.objective ?? '',
      adFormat: tx.adFormat ?? '',
      primaryText:
        (typeof tx.adPrimaryText === 'string' && tx.adPrimaryText.trim()) ||
        parsedPostCreative?.primaryText ||
        '',
      headline:
        (typeof tx.adHeadline === 'string' && tx.adHeadline.trim()) ||
        parsedPostCreative?.headline ||
        '',
      adDescription:
        (typeof tx.adDescription === 'string' && tx.adDescription.trim()) ||
        parsedPostCreative?.adDescription ||
        '',
      destinationUrl:
        (typeof tx.destinationUrl === 'string' && tx.destinationUrl.trim()) ||
        parsedPostCreative?.destinationUrl ||
        '',
      ctaLabel:
        (typeof tx.ctaLabel === 'string' && tx.ctaLabel.trim()) ||
        parsedPostCreative?.cta ||
        '',
      interests: Array.isArray(tx.interests) ? tx.interests : [],
      targetLocation: tx.targetLocation ?? '',
      targetAgeMin:
        typeof tx.targetAgeMin === 'number' ? tx.targetAgeMin : null,
      targetAgeMax:
        typeof tx.targetAgeMax === 'number' ? tx.targetAgeMax : null,
      mediaUrls:
        Array.isArray(tx.mediaUrls) && tx.mediaUrls.length > 0
          ? tx.mediaUrls
          : postMediaUrls,
      boostPackageId: tx.boostPackageId ?? '',
      durationPackageId: tx.durationPackageId ?? '',
      durationDays: tx.durationDays ?? 0,
      hiddenReason:
        typeof tx.hiddenReason === 'string' ? tx.hiddenReason : null,
      adminCancelReason:
        typeof tx.adminCancelReason === 'string' ? tx.adminCancelReason : null,
      post: {
        visibility:
          typeof promotedPost?.visibility === 'string'
            ? promotedPost.visibility
            : 'public',
        deleted: Boolean(promotedPost?.deletedAt),
      },
      metrics: {
        impressions,
        reach: reachUserIds.length,
        clicks,
        ctrPct,
        views,
        likes,
        comments: commentCount,
        reposts,
        engagements,
        avgDwellSeconds:
          typeof dwell?.avgDurationMs === 'number'
            ? Number((dwell.avgDurationMs / 1000).toFixed(2))
            : null,
        totalDwellSeconds:
          typeof dwell?.totalDurationMs === 'number'
            ? Number((dwell.totalDurationMs / 1000).toFixed(2))
            : 0,
        dwellSamples: dwell?.samples ?? 0,
        engagementRatePct,
      },
      actions: {
        canCancel: status !== 'canceled' && status !== 'completed',
        canReopen: status === 'canceled',
      },
    };
  }

  async performAdsCampaignAdminAction(params: {
    campaignId: string;
    action: 'cancel_campaign' | 'reopen_canceled_campaign';
    reason?: string;
    adminId: string;
  }): Promise<{
    campaignId: string;
    status: 'active' | 'hidden' | 'canceled' | 'completed';
    hiddenReason: string | null;
  }> {
    const campaignId = params.campaignId?.trim();
    if (!Types.ObjectId.isValid(campaignId)) {
      throw new BadRequestException('Invalid campaignId');
    }

    if (!Types.ObjectId.isValid(params.adminId)) {
      throw new BadRequestException('Invalid adminId');
    }

    const adminObjectId = new Types.ObjectId(params.adminId);
    const cancelReason = (params.reason ?? '').trim();

    const tx = await this.paymentTransactionModel
      .findOne({
        _id: new Types.ObjectId(campaignId),
        promotedPostId: { $ne: null },
      })
      .select(
        '_id userId promotedPostId campaignName customerEmail hiddenReason isExpiredHidden expiresAt',
      )
      .lean();

    if (!tx) {
      throw new NotFoundException('Campaign not found');
    }

    const now = new Date();
    const updates: Record<string, any> = {};

    if (params.action === 'cancel_campaign') {
      if (!cancelReason) {
        throw new BadRequestException('Cancellation reason is required');
      }
      const expiresAt = tx.expiresAt ? new Date(tx.expiresAt) : null;
      if (tx.isExpiredHidden || (expiresAt && expiresAt.getTime() <= now.getTime())) {
        throw new BadRequestException('Completed campaign cannot be canceled');
      }
      updates.hiddenReason = 'canceled';
      updates.hiddenAt = now;
      updates.isExpiredHidden = true;
      updates.adminCancelReason = cancelReason;
    } else if (params.action === 'reopen_canceled_campaign') {
      if (tx.hiddenReason !== 'canceled') {
        throw new BadRequestException('Only canceled campaigns can be reopened');
      }
      const expiresAt = tx.expiresAt ? new Date(tx.expiresAt) : null;
      if (expiresAt && expiresAt.getTime() <= now.getTime()) {
        throw new BadRequestException('Expired campaign cannot be reopened');
      }
      updates.hiddenReason = null;
      updates.hiddenAt = null;
      updates.isExpiredHidden = false;
      updates.adminCancelReason = null;
    }

    if (Object.keys(updates).length) {
      await this.paymentTransactionModel
        .updateOne({ _id: tx._id }, { $set: updates })
        .exec();
    }

    if (params.action === 'cancel_campaign') {
      const ownerUserId = tx.userId?.trim();
      const promotedPostId = tx.promotedPostId?.trim();

      if (ownerUserId && Types.ObjectId.isValid(ownerUserId)) {
        const noticeBody = [
          `Your ads campaign \"${tx.campaignName?.trim() || 'Ads Campaign'}\" was canceled by admin.`,
          `Reason: ${cancelReason}`,
          'No strike was added to your account for this action.',
        ].join(' ');

        try {
          await this.notificationsService.createSystemNoticeNotification({
            recipientId: ownerUserId,
            title: 'Ads campaign canceled by admin',
            body: noticeBody,
            level: 'warning',
            actionUrl: '/ads/campaigns',
          });
        } catch {
          // Keep admin action successful even if realtime delivery fails.
        }

        const ownerUser = await this.userModel
          .findById(ownerUserId)
          .select('_id email')
          .lean();

        const ownerProfile = await this.profileModel
          .findOne({ userId: new Types.ObjectId(ownerUserId) })
          .select('displayName')
          .lean();

        const recipientEmail =
          tx.customerEmail?.trim() || ownerUser?.email?.trim() || '';

        if (recipientEmail) {
          try {
            await this.mailService.sendAdsCampaignCanceledByAdminEmail({
              email: recipientEmail,
              displayName: ownerProfile?.displayName ?? null,
              campaignName: tx.campaignName ?? null,
              reason: cancelReason,
            });
          } catch {
            // Keep admin action successful even if email delivery fails.
          }
        }
      }

      if (promotedPostId && Types.ObjectId.isValid(promotedPostId)) {
        await this.moderationActionModel.create({
          targetType: 'post',
          targetId: new Types.ObjectId(promotedPostId),
          action: 'cancel_ads_campaign',
          category: 'ads_policy',
          reason: 'Admin canceled ads campaign',
          severity: 'medium',
          note: [
            `CampaignId: ${tx._id.toString()}`,
            `CampaignName: ${tx.campaignName?.trim() || 'Ads Campaign'}`,
            `OwnerUserId: ${tx.userId}`,
            `AdminReason: ${cancelReason}`,
            'StrikeDelta: +0',
          ].join(' | '),
          moderatorId: adminObjectId,
        });
      }
    }

    if (params.action === 'reopen_canceled_campaign') {
      const ownerUserId = tx.userId?.trim();
      const promotedPostId = tx.promotedPostId?.trim();

      if (ownerUserId && Types.ObjectId.isValid(ownerUserId)) {
        const noticeBody = [
          `Your ads campaign \"${tx.campaignName?.trim() || 'Ads Campaign'}\" was reopened by admin.`,
          'Your campaign can deliver again.',
          'No strike was added to your account for this action.',
        ].join(' ');

        try {
          await this.notificationsService.createSystemNoticeNotification({
            recipientId: ownerUserId,
            title: 'Ads campaign reopened by admin',
            body: noticeBody,
            level: 'info',
            actionUrl: '/ads/campaigns',
          });
        } catch {
          // Keep admin action successful even if realtime delivery fails.
        }

        const ownerUser = await this.userModel
          .findById(ownerUserId)
          .select('_id email')
          .lean();

        const ownerProfile = await this.profileModel
          .findOne({ userId: new Types.ObjectId(ownerUserId) })
          .select('displayName')
          .lean();

        const recipientEmail =
          tx.customerEmail?.trim() || ownerUser?.email?.trim() || '';

        if (recipientEmail) {
          try {
            await this.mailService.sendAdsCampaignReopenedByAdminEmail({
              email: recipientEmail,
              displayName: ownerProfile?.displayName ?? null,
              campaignName: tx.campaignName ?? null,
            });
          } catch {
            // Keep admin action successful even if email delivery fails.
          }
        }
      }

      if (promotedPostId && Types.ObjectId.isValid(promotedPostId)) {
        await this.moderationActionModel.create({
          targetType: 'post',
          targetId: new Types.ObjectId(promotedPostId),
          action: 'reopen_ads_campaign',
          category: 'ads_policy',
          reason: 'Admin reopened canceled ads campaign',
          severity: null,
          note: [
            `CampaignId: ${tx._id.toString()}`,
            `CampaignName: ${tx.campaignName?.trim() || 'Ads Campaign'}`,
            `OwnerUserId: ${tx.userId}`,
            'StrikeDelta: +0',
          ].join(' | '),
          moderatorId: adminObjectId,
        });
      }
    }

    const refreshed = await this.paymentTransactionModel
      .findById(tx._id)
      .select('_id hiddenReason isExpiredHidden expiresAt')
      .lean();

    if (!refreshed) {
      throw new NotFoundException('Campaign not found after update');
    }

    return {
      campaignId: refreshed._id.toString(),
      status: this.getCampaignLifecycleStatus(refreshed, new Date()),
      hiddenReason:
        typeof refreshed.hiddenReason === 'string' ? refreshed.hiddenReason : null,
    };
  }

  async getRecentAdminActivity(limit = 10): Promise<{
    items: Array<{
      actor: string;
      action: string;
      occurredAt: Date | null;
      type: 'post' | 'comment' | 'user';
      targetId: string;
    }>;
  }> {
    const safeLimit = Math.min(Math.max(limit, 1), 50);

    const actionDocs: Array<{
      targetType: 'post' | 'comment' | 'user';
      targetId: Types.ObjectId;
      action: string;
      moderatorId?: Types.ObjectId | null;
      severity?: 'low' | 'medium' | 'high' | null;
      createdAt?: Date | null;
    }> = await this.moderationActionModel
      .find({
        invalidatedAt: null,
        action: {
          $in: [
            'auto_hidden_pending_review',
            'rollback_moderation',
            'no_violation',
            'remove_post',
            'restrict_post',
            'delete_comment',
            'warn',
            'mute_interaction',
            'suspend_user',
            'limit_account',
            'violation',
            'cancel_ads_campaign',
            'reopen_ads_campaign',
          ],
        },
      })
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .select('targetType targetId action moderatorId severity createdAt')
      .lean();

    const moderatorIds = Array.from(
      new Set(actionDocs.map((item) => item.moderatorId?.toString?.()).filter(Boolean)),
    )
      .filter((id): id is string => Boolean(id))
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const postTargetIds = actionDocs
      .filter((item) => item.targetType === 'post')
      .map((item) => item.targetId?.toString?.())
      .filter((id): id is string => Boolean(id) && Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const commentTargetIds = actionDocs
      .filter((item) => item.targetType === 'comment')
      .map((item) => item.targetId?.toString?.())
      .filter((id): id is string => Boolean(id) && Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const userTargetIds = actionDocs
      .filter((item) => item.targetType === 'user')
      .map((item) => item.targetId?.toString?.())
      .filter((id): id is string => Boolean(id) && Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    type TargetPostDoc = {
      _id: Types.ObjectId;
      authorId?: Types.ObjectId | null;
      content?: string | null;
    };
    type TargetCommentDoc = {
      _id: Types.ObjectId;
      authorId?: Types.ObjectId | null;
      content?: string | null;
    };
    type TargetProfileDoc = {
      userId: Types.ObjectId;
      displayName?: string | null;
      username?: string | null;
    };
    type ModeratorUserDoc = {
      _id: Types.ObjectId;
      email?: string | null;
    };

    const [moderatorProfiles, moderatorUsers, posts, comments, userProfiles]: [
      TargetProfileDoc[],
      ModeratorUserDoc[],
      TargetPostDoc[],
      TargetCommentDoc[],
      TargetProfileDoc[],
    ] = await Promise.all([
      moderatorIds.length
        ? this.profileModel
            .find({ userId: { $in: moderatorIds } })
            .select('userId displayName username')
            .lean<TargetProfileDoc[]>()
            .exec()
        : Promise.resolve<TargetProfileDoc[]>([]),
      moderatorIds.length
        ? this.userModel
            .find({ _id: { $in: moderatorIds } })
            .select('_id email')
            .lean<ModeratorUserDoc[]>()
            .exec()
        : Promise.resolve<ModeratorUserDoc[]>([]),
      postTargetIds.length
        ? this.postModel
            .find({ _id: { $in: postTargetIds } })
            .select('_id authorId content')
            .lean<TargetPostDoc[]>()
            .exec()
        : Promise.resolve<TargetPostDoc[]>([]),
      commentTargetIds.length
        ? this.commentModel
            .find({ _id: { $in: commentTargetIds } })
            .select('_id authorId content')
            .lean<TargetCommentDoc[]>()
            .exec()
        : Promise.resolve<TargetCommentDoc[]>([]),
      userTargetIds.length
        ? this.profileModel
            .find({ userId: { $in: userTargetIds } })
            .select('userId displayName username')
            .lean<TargetProfileDoc[]>()
            .exec()
        : Promise.resolve<TargetProfileDoc[]>([]),
    ]);

    const postMap = new Map(posts.map((item) => [item._id.toString(), item]));
    const commentMap = new Map(comments.map((item) => [item._id.toString(), item]));
    const moderatorProfileMap = new Map(
      moderatorProfiles.map((item) => [item.userId.toString(), item]),
    );
    const moderatorUserMap = new Map(
      moderatorUsers.map((item) => [item._id.toString(), item]),
    );
    const userProfileMap = new Map(
      userProfiles.map((item) => [item.userId.toString(), item]),
    );

    const authorIds = Array.from(
      new Set(
        [...posts, ...comments]
          .map((item) => item.authorId?.toString?.())
          .filter(
            (id): id is string =>
              typeof id === 'string' && id.length > 0 && Types.ObjectId.isValid(id),
          ),
      ),
    ).map((id) => new Types.ObjectId(id));

    const authorProfiles = authorIds.length
      ? await this.profileModel
          .find({ userId: { $in: authorIds } })
          .select('userId displayName username')
          .lean<TargetProfileDoc[]>()
          .exec()
      : [];
    const authorProfileMap = new Map(
      authorProfiles.map((item) => [item.userId.toString(), item]),
    );

    const buildTargetLabel = (item: {
      targetType: 'post' | 'comment' | 'user';
      targetId: Types.ObjectId;
    }) => {
      const id = item.targetId.toString();
      if (item.targetType === 'post') {
        const post = postMap.get(id);
        const authorProfile = post?.authorId
          ? authorProfileMap.get(post.authorId.toString())
          : null;
        if (authorProfile?.username) return `@${authorProfile.username}`;
        if (authorProfile?.displayName) return authorProfile.displayName;
        if (post?.content?.trim()) return post.content.trim().slice(0, 80);
        return `post:${id}`;
      }
      if (item.targetType === 'comment') {
        const comment = commentMap.get(id);
        const authorProfile = comment?.authorId
          ? authorProfileMap.get(comment.authorId.toString())
          : null;
        if (authorProfile?.username) return `@${authorProfile.username}`;
        if (authorProfile?.displayName) return authorProfile.displayName;
        if (comment?.content?.trim()) return comment.content.trim().slice(0, 80);
        return `comment:${id}`;
      }

      const profile = userProfileMap.get(id);
      if (profile?.username) return `@${profile.username}`;
      if (profile?.displayName) return profile.displayName;
      return `user:${id}`;
    };

    const buildActionText = (params: {
      action: string;
      targetType: 'post' | 'comment' | 'user';
      targetLabel: string;
      targetId: string;
      severity: 'low' | 'medium' | 'high' | null;
    }) => {
      const { action, targetType, targetLabel, targetId, severity } = params;
      const normalizedAction = action.replace(/[_-]+/g, ' ').trim().toUpperCase();
      const strikeDelta = this.getStrikeIncrement(action, severity);
      const targetText = `${targetType} ${targetLabel} (id: ${targetId})`;

      if (action === 'auto_hidden_pending_review') {
        return `Action: AUTO HIDDEN PENDING REVIEW · Strike: +0 · Target: ${targetText}`;
      }
      if (action === 'rollback_moderation') {
        return `Action: ROLLBACK MODERATION · Target: ${targetText}`;
      }
      if (action === 'no_violation') {
        return `Action: NO VIOLATION · Target: ${targetText}`;
      }

      return `Action: ${normalizedAction} · Strike: +${strikeDelta} · Target: ${targetText}`;
    };

    const items = actionDocs.map((item) => {
      const moderatorId = item.moderatorId?.toString?.() ?? '';
      const moderatorProfile = moderatorProfileMap.get(moderatorId);
      const moderatorUser = moderatorUserMap.get(moderatorId);
      const actor =
        moderatorProfile?.displayName ||
        (moderatorProfile?.username ? `@${moderatorProfile.username}` : null) ||
        moderatorUser?.email ||
        'admin';
      const targetLabel = buildTargetLabel({
        targetType: item.targetType,
        targetId: item.targetId,
      });

      return {
        actor,
        action: buildActionText({
          action: item.action,
          targetType: item.targetType,
          targetLabel,
          targetId: item.targetId.toString(),
          severity: item.severity ?? null,
        }),
        occurredAt: item.createdAt ?? null,
        type: item.targetType,
        targetId: item.targetId.toString(),
      };
    });

    return { items };
  }

  async getAuditLogs(params?: {
    limit?: number;
    offset?: number;
    type?: string;
    action?: string;
  }): Promise<{
    items: Array<{
      actionId: string;
      actor: {
        userId: string | null;
        displayName: string | null;
        username: string | null;
        email: string | null;
      };
      action: {
        code: string;
        label: string;
        strikeDelta: number | null;
      };
      target: {
        type: 'post' | 'comment' | 'user';
        id: string;
        ownerLabel: string;
      };
      detail: {
        category: string;
        reason: string;
        severity: 'low' | 'medium' | 'high' | null;
        note: string | null;
        expiresAt: Date | null;
      };
      invalidation: {
        invalidated: boolean;
        at: Date | null;
        reason: string | null;
        by: {
          userId: string | null;
          displayName: string | null;
          username: string | null;
          email: string | null;
        } | null;
      };
      occurredAt: Date | null;
    }>;
    total: number;
    hasMore: boolean;
  }> {
    const safeLimit = Math.min(Math.max(params?.limit ?? 50, 1), 200);
    const safeOffset = Math.max(params?.offset ?? 0, 0);
    const normalizedType =
      params?.type === 'post' || params?.type === 'comment' || params?.type === 'user'
        ? params.type
        : null;

    const query: Record<string, any> = {
      action: {
        $in: [
          'auto_hidden_pending_review',
          'rollback_moderation',
          'no_violation',
          'remove_post',
          'restrict_post',
          'delete_comment',
          'warn',
          'mute_interaction',
          'suspend_user',
          'limit_account',
          'violation',
          'creator_verification_approved',
          'creator_verification_rejected',
          'creator_verification_revoked',
          'cancel_ads_campaign',
          'reopen_ads_campaign',
        ],
      },
    };

    if (normalizedType) {
      query.targetType = normalizedType;
    }
    if (params?.action?.trim()) {
      query.action = params.action.trim();
    }

    const [total, rows]: [number, Array<{
      _id: Types.ObjectId;
      targetType: 'post' | 'comment' | 'user';
      targetId: Types.ObjectId;
      action: string;
      category: string;
      reason: string;
      severity?: 'low' | 'medium' | 'high' | null;
      note?: string | null;
      expiresAt?: Date | null;
      moderatorId?: Types.ObjectId | null;
      invalidatedAt?: Date | null;
      invalidatedReason?: string | null;
      invalidatedBy?: Types.ObjectId | null;
      createdAt?: Date | null;
    }>] = await Promise.all([
      this.moderationActionModel.countDocuments(query).exec(),
      this.moderationActionModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(safeOffset)
        .limit(safeLimit)
        .select(
          '_id targetType targetId action category reason severity note expiresAt moderatorId invalidatedAt invalidatedReason invalidatedBy createdAt',
        )
        .lean(),
    ]);

    const moderatorIds = Array.from(
      new Set(rows.map((row) => row.moderatorId?.toString?.()).filter(Boolean)),
    )
      .filter((id): id is string => typeof id === 'string' && Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const invalidatorIds = Array.from(
      new Set(rows.map((row) => row.invalidatedBy?.toString?.()).filter(Boolean)),
    )
      .filter((id): id is string => typeof id === 'string' && Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const postTargetIds = rows
      .filter((row) => row.targetType === 'post')
      .map((row) => row.targetId?.toString?.())
      .filter((id): id is string => typeof id === 'string' && Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const commentTargetIds = rows
      .filter((row) => row.targetType === 'comment')
      .map((row) => row.targetId?.toString?.())
      .filter((id): id is string => typeof id === 'string' && Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const userTargetIds = rows
      .filter((row) => row.targetType === 'user')
      .map((row) => row.targetId?.toString?.())
      .filter((id): id is string => typeof id === 'string' && Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    type BasicProfileDoc = {
      userId: Types.ObjectId;
      displayName?: string | null;
      username?: string | null;
    };
    type BasicUserDoc = {
      _id: Types.ObjectId;
      email?: string | null;
    };
    type AuditPostDoc = {
      _id: Types.ObjectId;
      authorId?: Types.ObjectId | null;
      content?: string | null;
    };
    type AuditCommentDoc = {
      _id: Types.ObjectId;
      authorId?: Types.ObjectId | null;
      content?: string | null;
    };

    const actorIds = Array.from(
      new Set([...moderatorIds, ...invalidatorIds].map((id) => id.toString())),
    ).map((id) => new Types.ObjectId(id));

    const [actorProfiles, actorUsers, posts, comments, userProfiles]: [
      BasicProfileDoc[],
      BasicUserDoc[],
      AuditPostDoc[],
      AuditCommentDoc[],
      BasicProfileDoc[],
    ] = await Promise.all([
      actorIds.length
        ? this.profileModel
            .find({ userId: { $in: actorIds } })
            .select('userId displayName username')
            .lean<BasicProfileDoc[]>()
            .exec()
        : Promise.resolve<BasicProfileDoc[]>([]),
      actorIds.length
        ? this.userModel
            .find({ _id: { $in: actorIds } })
            .select('_id email')
            .lean<BasicUserDoc[]>()
            .exec()
        : Promise.resolve<BasicUserDoc[]>([]),
      postTargetIds.length
        ? this.postModel
            .find({ _id: { $in: postTargetIds } })
            .select('_id authorId content')
            .lean<AuditPostDoc[]>()
            .exec()
        : Promise.resolve<AuditPostDoc[]>([]),
      commentTargetIds.length
        ? this.commentModel
            .find({ _id: { $in: commentTargetIds } })
            .select('_id authorId content')
            .lean<AuditCommentDoc[]>()
            .exec()
        : Promise.resolve<AuditCommentDoc[]>([]),
      userTargetIds.length
        ? this.profileModel
            .find({ userId: { $in: userTargetIds } })
            .select('userId displayName username')
            .lean<BasicProfileDoc[]>()
            .exec()
        : Promise.resolve<BasicProfileDoc[]>([]),
    ]);

    const actorProfileMap = new Map(actorProfiles.map((item) => [item.userId.toString(), item]));
    const actorUserMap = new Map(actorUsers.map((item) => [item._id.toString(), item]));
    const postMap = new Map(posts.map((item) => [item._id.toString(), item]));
    const commentMap = new Map(comments.map((item) => [item._id.toString(), item]));
    const userProfileMap = new Map(userProfiles.map((item) => [item.userId.toString(), item]));

    const ownerIds = Array.from(
      new Set(
        [...posts, ...comments]
          .map((item) => item.authorId?.toString?.())
          .filter((id): id is string => typeof id === 'string' && Types.ObjectId.isValid(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const ownerProfiles = ownerIds.length
      ? await this.profileModel
          .find({ userId: { $in: ownerIds } })
          .select('userId displayName username')
          .lean<BasicProfileDoc[]>()
          .exec()
      : [];
    const ownerProfileMap = new Map(ownerProfiles.map((item) => [item.userId.toString(), item]));

    const getActor = (id: Types.ObjectId | null | undefined) => {
      const key = id?.toString?.() ?? '';
      if (!key) {
        return {
          userId: null,
          displayName: null,
          username: null,
          email: null,
        };
      }
      const profile = actorProfileMap.get(key);
      const user = actorUserMap.get(key);
      return {
        userId: key,
        displayName: profile?.displayName ?? null,
        username: profile?.username ?? null,
        email: user?.email ?? null,
      };
    };

    const getTargetOwnerLabel = (row: {
      targetType: 'post' | 'comment' | 'user';
      targetId: Types.ObjectId;
    }) => {
      const targetKey = row.targetId.toString();
      if (row.targetType === 'post') {
        const post = postMap.get(targetKey);
        const owner = post?.authorId ? ownerProfileMap.get(post.authorId.toString()) : null;
        if (owner?.username) return `@${owner.username}`;
        if (owner?.displayName) return owner.displayName;
        if (post?.content?.trim()) return post.content.trim().slice(0, 60);
        return 'Unknown owner';
      }
      if (row.targetType === 'comment') {
        const comment = commentMap.get(targetKey);
        const owner = comment?.authorId
          ? ownerProfileMap.get(comment.authorId.toString())
          : null;
        if (owner?.username) return `@${owner.username}`;
        if (owner?.displayName) return owner.displayName;
        if (comment?.content?.trim()) return comment.content.trim().slice(0, 60);
        return 'Unknown owner';
      }
      const profile = userProfileMap.get(targetKey);
      if (profile?.username) return `@${profile.username}`;
      if (profile?.displayName) return profile.displayName;
      return 'Unknown user';
    };

    const items = rows.map((row) => {
      const strikeDelta =
        [
          'no_violation',
          'rollback_moderation',
          'creator_verification_approved',
          'creator_verification_rejected',
          'creator_verification_revoked',
        ].includes(row.action)
          ? null
          : this.getStrikeIncrement(row.action, row.severity ?? null);

      const actionLabelMap: Record<string, string> = {
        creator_verification_approved: 'CREATOR VERIFICATION APPROVED',
        creator_verification_rejected: 'CREATOR VERIFICATION REJECTED',
        creator_verification_revoked: 'CREATOR VERIFICATION REVOKED',
        cancel_ads_campaign: 'ADS CAMPAIGN CANCELED',
        reopen_ads_campaign: 'ADS CAMPAIGN REOPENED',
      };

      return {
        actionId: row._id.toString(),
        actor: getActor(row.moderatorId ?? null),
        action: {
          code: row.action,
          label:
            actionLabelMap[row.action] ??
            row.action.replace(/[_-]+/g, ' ').trim().toUpperCase(),
          strikeDelta,
        },
        target: {
          type: row.targetType,
          id: row.targetId.toString(),
          ownerLabel: getTargetOwnerLabel({
            targetType: row.targetType,
            targetId: row.targetId,
          }),
        },
        detail: {
          category: row.category,
          reason: row.reason,
          severity: row.severity ?? null,
          note: row.note ?? null,
          expiresAt: row.expiresAt ?? null,
        },
        invalidation: {
          invalidated: Boolean(row.invalidatedAt),
          at: row.invalidatedAt ?? null,
          reason: row.invalidatedReason ?? null,
          by: row.invalidatedBy ? getActor(row.invalidatedBy) : null,
        },
        occurredAt: row.createdAt ?? null,
      };
    });

    return {
      items,
      total,
      hasMore: safeOffset + items.length < total,
    };
  }

  async sendBroadcastNotice(params: {
    adminId: string;
    title?: string | null;
    body: string;
    level?: 'info' | 'warning' | 'critical';
    actionUrl?: string | null;
    targetMode?: 'all' | 'include' | 'exclude';
    includeUserIds?: string[];
    excludeUserIds?: string[];
  }) {
    const title = params.title?.trim();
    const body = params.body?.trim();
    if (!body) {
      throw new BadRequestException('Body is required');
    }
    if (!Types.ObjectId.isValid(params.adminId)) {
      throw new BadRequestException('Invalid admin id');
    }
    const level =
      params.level === 'warning' || params.level === 'critical'
        ? params.level
        : 'info';

    const actionUrl = params.actionUrl?.trim() || null;
    if (actionUrl && !/^https?:\/\//i.test(actionUrl)) {
      throw new BadRequestException('Action URL must start with http:// or https://');
    }

    const targetMode =
      params.targetMode === 'include' || params.targetMode === 'exclude'
        ? params.targetMode
        : 'all';

    const includeUserIds = await this.resolveUserIdentifiers(
      params.includeUserIds,
      'include',
    );
    const excludeUserIds = await this.resolveUserIdentifiers(
      params.excludeUserIds,
      'exclude',
    );

    if (targetMode === 'include' && includeUserIds.length === 0) {
      throw new BadRequestException('Include mode requires at least one user id');
    }

    if (targetMode === 'exclude' && excludeUserIds.length === 0) {
      throw new BadRequestException('Exclude mode requires at least one user id');
    }

    return this.notificationsService.broadcastSystemNotice({
      adminId: params.adminId,
      title: title && title.length ? title : undefined,
      body,
      level,
      actionUrl,
      targetMode,
      includeUserIds,
      excludeUserIds,
    });
  }

  async getBroadcastNoticeHistory(limit?: number) {
    return this.notificationsService.listSystemNoticeHistory(limit ?? 30);
  }

  async suggestBroadcastUsers(query?: string, limit = 8): Promise<{
    items: Array<{
      userId: string;
      username: string;
      displayName: string | null;
      email: string | null;
      avatarUrl: string | null;
    }>;
  }> {
    const q = String(query ?? '').trim();
    if (q.length < 1) {
      return { items: [] };
    }

    const safeLimit = Math.min(Math.max(limit, 1), 20);
    const regex = new RegExp(this.escapeRegex(q), 'i');

    const profiles = await this.profileModel
      .find({ username: regex })
      .select('userId username displayName avatarUrl')
      .limit(safeLimit)
      .lean<
        Array<{
          userId: Types.ObjectId;
          username?: string;
          displayName?: string;
          avatarUrl?: string;
        }>
      >()
      .exec();

    const userIds = profiles
      .map((item) => item.userId?.toString?.())
      .filter((id): id is string => typeof id === 'string' && Types.ObjectId.isValid(id));

    const users = userIds.length
      ? await this.userModel
          .find({ _id: { $in: userIds } })
          .select('_id email')
          .lean<Array<{ _id: Types.ObjectId; email?: string }>>()
          .exec()
      : [];

    const userMap = new Map(users.map((item) => [item._id.toString(), item]));

    const items = profiles
      .filter((item) => item.username && item.username.trim())
      .map((item) => {
        const userId = item.userId.toString();
        const user = userMap.get(userId);
        return {
          userId,
          username: String(item.username).trim(),
          displayName: item.displayName ?? null,
          email: user?.email ?? null,
          avatarUrl: item.avatarUrl ?? null,
        };
      });

    return { items };
  }

  private async resolveUserIdentifiers(
    input: string[] | undefined,
    sourceLabel: 'include' | 'exclude',
  ): Promise<string[]> {
    const values = Array.from(
      new Set(
        (input ?? [])
          .map((raw) => String(raw ?? '').trim())
          .filter(Boolean),
      ),
    );
    if (!values.length) return [];

    const objectIdSet = new Set<string>();
    const usernames: string[] = [];

    values.forEach((value) => {
      const normalized = value.startsWith('@') ? value.slice(1) : value;
      if (Types.ObjectId.isValid(normalized)) {
        objectIdSet.add(normalized);
      } else {
        usernames.push(normalized.toLowerCase());
      }
    });

    if (usernames.length) {
      const profiles = await this.profileModel
        .find({ username: { $in: usernames } })
        .select('userId username')
        .lean<Array<{ userId: Types.ObjectId; username?: string }>>()
        .exec();

      const foundUsernames = new Set(
        profiles
          .map((item) => String(item.username ?? '').toLowerCase())
          .filter(Boolean),
      );

      const unresolved = usernames.filter((name) => !foundUsernames.has(name));
      if (unresolved.length) {
        throw new BadRequestException(
          `Unknown ${sourceLabel} username(s): ${unresolved.join(', ')}`,
        );
      }

      profiles.forEach((item) => {
        const id = item.userId?.toString?.();
        if (id && Types.ObjectId.isValid(id)) {
          objectIdSet.add(id);
        }
      });
    }

    return Array.from(objectIdSet);
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private extractCloudinaryPublicIdFromUrl(url: string | null | undefined): string | null {
    if (!url || typeof url !== 'string') return null;

    try {
      const normalized = url.split('?')[0] ?? '';
      const marker = '/upload/';
      const markerIndex = normalized.indexOf(marker);
      if (markerIndex < 0) return null;

      const afterUpload = normalized.slice(markerIndex + marker.length);
      if (!afterUpload) return null;

      const segments = afterUpload.split('/').filter(Boolean);
      if (!segments.length) return null;

      // Drop optional transformation/version segments and keep the publicId path.
      let startIndex = 0;
      for (let i = 0; i < segments.length; i += 1) {
        const part = segments[i];
        if (/^v\d+$/.test(part)) {
          startIndex = i + 1;
          break;
        }
      }

      const publicSegments = segments.slice(startIndex);
      if (!publicSegments.length) return null;

      const last = publicSegments[publicSegments.length - 1];
      const dotIndex = last.lastIndexOf('.');
      if (dotIndex > 0) {
        publicSegments[publicSegments.length - 1] = last.slice(0, dotIndex);
      }

      const publicId = publicSegments.join('/').trim();
      return publicId || null;
    } catch {
      return null;
    }
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
    comparison: {
      current: {
        approve: number;
        blur: number;
        reject: number;
      };
      previous: {
        approve: number;
        blur: number;
        reject: number;
      };
    };
  }> {
    const safeLimit = Math.min(Math.max(limit, 1), 50);

    const previousWindowEnd = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const previousWindowStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const decisionRank: Record<'approve' | 'blur' | 'reject', number> = {
      approve: 1,
      blur: 2,
      reject: 3,
    };

    const resolvePrimaryModeration = (media: any[]): {
      decision: 'approve' | 'blur' | 'reject';
      provider: string | null;
      reasons: string[];
      url: string | null;
      moderatedCount: number;
    } | null => {
      const moderated = media.filter((item: any) => {
        const decision = item?.metadata?.moderationDecision;
        return (
          decision === 'approve' || decision === 'blur' || decision === 'reject'
        );
      });

      if (!moderated.length) {
        return null;
      }

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

      return {
        decision: primary.decision,
        provider: primary.provider,
        reasons: primary.reasons,
        url: primary.url,
        moderatedCount: moderated.length,
      };
    };

    const docs = await this.postModel
      .find({
        createdAt: { $gte: previousWindowEnd },
        'media.metadata.moderationDecision': { $in: ['approve', 'blur', 'reject'] },
      })
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .select('authorId createdAt visibility kind media')
      .lean();

    const statsDocs = await this.postModel
      .find({
        createdAt: { $gte: previousWindowStart },
        'media.metadata.moderationDecision': { $in: ['approve', 'blur', 'reject'] },
      })
      .select('createdAt media')
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

    const currentCounts = {
      approve: 0,
      blur: 0,
      reject: 0,
    };

    const previousCounts = {
      approve: 0,
      blur: 0,
      reject: 0,
    };

    for (const doc of statsDocs) {
      const media = Array.isArray(doc.media) ? doc.media : [];
      const primary = resolvePrimaryModeration(media);
      if (!primary) continue;

      const createdAt = doc.createdAt ? new Date(doc.createdAt) : null;
      if (!createdAt || Number.isNaN(createdAt.getTime())) continue;

      if (createdAt >= previousWindowEnd) {
        currentCounts[primary.decision] += 1;
      } else {
        previousCounts[primary.decision] += 1;
      }
    }

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
      const primary = resolvePrimaryModeration(media);
      if (!primary) continue;

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
        moderatedMediaCount: primary.moderatedCount,
        previewUrl: primary.url,
        reasons: primary.reasons,
      });
    }

    return {
      items,
      counts: currentCounts,
      comparison: {
        current: currentCounts,
        previous: previousCounts,
      },
    };
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
      originalUrl: string | null;
      moderationDecision: 'approve' | 'blur' | 'reject' | 'unknown';
      moderationProvider: string | null;
      moderationReasons: string[];
      moderationScores: Record<string, number>;
    }>;
  }> {
    const doc = await this.postModel
      .findOne({ _id: postId })
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
          originalUrl:
            typeof item?.metadata?.originalSecureUrl === 'string'
              ? item.metadata.originalSecureUrl
              : typeof item?.metadata?.originalUrl === 'string'
                ? item.metadata.originalUrl
                : null,
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

  async applyMediaModerationAction(params: {
    postId: string;
    mediaIndex: number;
    decision: 'blur' | 'reject';
    adminId: string;
  }): Promise<{
    status: 'ok';
    outcome: 'media_blurred' | 'post_removed';
    updatedMedia?: {
      index: number;
      type: 'image' | 'video';
      url: string;
      originalUrl: string | null;
      moderationDecision: 'approve' | 'blur' | 'reject' | 'unknown';
      moderationProvider: string | null;
      moderationReasons: string[];
      moderationScores: Record<string, number>;
    };
  }> {
    if (!Types.ObjectId.isValid(params.postId)) {
      throw new BadRequestException('Invalid post id');
    }
    if (!Types.ObjectId.isValid(params.adminId)) {
      throw new BadRequestException('Invalid admin id');
    }
    if (!Number.isInteger(params.mediaIndex) || params.mediaIndex < 0) {
      throw new BadRequestException('Invalid media index');
    }

    const postObjectId = new Types.ObjectId(params.postId);
    const adminObjectId = new Types.ObjectId(params.adminId);

    const doc = await this.postModel
      .findById(postObjectId)
      .select('authorId kind media deletedAt')
      .lean();

    if (!doc?._id) {
      throw new NotFoundException('Post not found');
    }

    if (doc.deletedAt) {
      throw new BadRequestException('Post is already removed');
    }

    const media = Array.isArray(doc.media) ? [...doc.media] : [];
    if (params.mediaIndex >= media.length) {
      throw new BadRequestException('Media index out of range');
    }

    const target = media[params.mediaIndex] as any;
    const metadata =
      target?.metadata && typeof target.metadata === 'object'
        ? { ...(target.metadata as Record<string, unknown>) }
        : {};

    const currentDecisionRaw = metadata['moderationDecision'];
    const currentDecision: 'approve' | 'blur' | 'reject' | 'unknown' =
      currentDecisionRaw === 'approve' ||
      currentDecisionRaw === 'blur' ||
      currentDecisionRaw === 'reject'
        ? currentDecisionRaw
        : 'unknown';

    if (params.decision === 'blur') {
      if (currentDecision === 'blur') {
        throw new BadRequestException('Media is already blurred');
      }

      const publicId =
        typeof metadata['publicId'] === 'string'
          ? metadata['publicId']
          : this.extractCloudinaryPublicIdFromUrl(
              typeof metadata['originalSecureUrl'] === 'string'
                ? metadata['originalSecureUrl']
                : typeof metadata['originalUrl'] === 'string'
                  ? metadata['originalUrl']
                  : typeof target?.url === 'string'
                    ? target.url
                    : null,
            );
      if (!publicId) {
        throw new BadRequestException(
          'Cannot blur media because Cloudinary publicId is missing or invalid',
        );
      }

      const isVideo = target?.type === 'video';
      const blurredUrl = isVideo
        ? this.cloudinary.buildBlurVideoUrl({ publicId, secure: false })
        : this.cloudinary.buildBlurImageUrl({ publicId, secure: false });
      const blurredSecureUrl = isVideo
        ? this.cloudinary.buildBlurVideoUrl({ publicId, secure: true })
        : this.cloudinary.buildBlurImageUrl({ publicId, secure: true });

      const existingReasons = Array.isArray(metadata['moderationReasons'])
        ? (metadata['moderationReasons'] as unknown[]).filter(
            (value): value is string => typeof value === 'string',
          )
        : [];
      const manualReason = `Admin manual blur on media #${params.mediaIndex + 1}`;
      const nextReasons = Array.from(new Set([...existingReasons, manualReason]));

      const originalUrl =
        typeof metadata['originalUrl'] === 'string'
          ? (metadata['originalUrl'] as string)
          : typeof target?.url === 'string'
            ? (target.url as string)
            : null;
      const originalSecureUrl =
        typeof metadata['originalSecureUrl'] === 'string'
          ? (metadata['originalSecureUrl'] as string)
          : originalUrl;

      media[params.mediaIndex] = {
        ...target,
        url: blurredUrl,
        metadata: {
          ...metadata,
          originalUrl,
          originalSecureUrl,
          blurredSecureUrl,
          moderationDecision: 'blur',
          moderationProvider: 'admin_manual',
          moderationReasons: nextReasons,
          moderatedByAdminAt: new Date().toISOString(),
        },
      };

      await this.postModel
        .updateOne(
          { _id: postObjectId },
          {
            $set: {
              media,
              moderationState: 'normal',
            },
          },
        )
        .exec();

      await this.moderationActionModel.create({
        targetType: 'post',
        targetId: postObjectId,
        action: 'violation',
        category: 'manual_media_moderation',
        reason: manualReason,
        severity: 'low',
        note: `Manual media action: BLUR | mediaIndex=${params.mediaIndex} | previousDecision=${currentDecision} | providerBefore=${
          typeof metadata['moderationProvider'] === 'string'
            ? metadata['moderationProvider']
            : 'unknown'
        }`,
        moderatorId: adminObjectId,
      });

      const rawScores =
        media[params.mediaIndex]?.metadata &&
        typeof media[params.mediaIndex].metadata === 'object' &&
        typeof (media[params.mediaIndex].metadata as Record<string, unknown>)[
          'moderationScores'
        ] === 'object'
          ? ((media[params.mediaIndex].metadata as Record<string, unknown>)[
              'moderationScores'
            ] as Record<string, unknown>)
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

      return {
        status: 'ok',
        outcome: 'media_blurred',
        updatedMedia: {
          index: params.mediaIndex,
          type: media[params.mediaIndex]?.type === 'video' ? 'video' : 'image',
          url:
            typeof media[params.mediaIndex]?.url === 'string'
              ? media[params.mediaIndex].url
              : '',
          originalUrl,
          moderationDecision: 'blur',
          moderationProvider: 'admin_manual',
          moderationReasons: nextReasons,
          moderationScores,
        },
      };
    }

    if (currentDecision === 'reject') {
      throw new BadRequestException('Media is already rejected');
    }

    const existingReasons = Array.isArray(metadata['moderationReasons'])
      ? (metadata['moderationReasons'] as unknown[]).filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
    const rejectReason =
      existingReasons[0] ??
      `Admin rejected media #${params.mediaIndex + 1} after manual review`;

    media[params.mediaIndex] = {
      ...target,
      metadata: {
        ...metadata,
        moderationDecision: 'reject',
        moderationProvider: 'admin_manual',
        moderationReasons: Array.from(
          new Set([
            ...existingReasons,
            `Admin manual reject on media #${params.mediaIndex + 1}`,
          ]),
        ),
        moderatedByAdminAt: new Date().toISOString(),
      },
    };

    await this.moderationActionModel.create({
      targetType: 'post',
      targetId: postObjectId,
      action: 'remove_post',
      category: 'automated_content_moderation',
      reason: rejectReason,
      severity: 'low',
      note: `Manual media action: REJECT_POST | mediaIndex=${params.mediaIndex} | previousDecision=${currentDecision} | triggerMediaType=${
        target?.type === 'video' ? 'video' : 'image'
      }`,
      moderatorId: adminObjectId,
    });

    await this.postModel
      .updateOne(
        { _id: postObjectId },
        {
          $set: {
            media,
            moderationState: 'removed',
            deletedAt: new Date(),
            deletedBy: adminObjectId,
            deletedSource: 'system',
            deletedReason: rejectReason,
          },
        },
      )
      .exec();

    const authorObjectId = new Types.ObjectId(doc.authorId);
    await this.userModel
      .updateOne({ _id: authorObjectId }, { $inc: { strikeCount: 1 } })
      .exec();

    await this.notificationsService.createPostModerationResultNotification({
      recipientId: authorObjectId.toString(),
      postId: postObjectId.toString(),
      postKind: (doc.kind ?? 'post') as 'post' | 'reel',
      decision: 'reject',
      reasons: [rejectReason],
    });

    return {
      status: 'ok',
      outcome: 'post_removed',
    };
  }

  async getDirectModerationPosts(params: {
    q?: string;
    limit?: number;
    offset?: number;
    state?: string;
    type?: string;
    visibility?: string;
    autoHidden?: string;
  }): Promise<{
    items: Array<{
      postId: string;
      authorId: string;
      authorDisplayName: string | null;
      authorUsername: string | null;
      contentPreview: string;
      media: Array<{
        type: 'image' | 'video';
        url: string;
        originalUrl: string | null;
      }>;
      visibility: string;
      moderationState: string;
      autoHiddenPendingReview: boolean;
      createdAt: Date | null;
    }>;
    offset: number;
    limit: number;
    hasMore: boolean;
  }> {
    const safeLimit = Math.min(Math.max(params.limit ?? 30, 1), 100);
    const safeOffset = Math.max(params.offset ?? 0, 0);
    const q = (params.q ?? '').trim();

    const promotedPostIdsRaw = await this.paymentTransactionModel
      .distinct('promotedPostId', { promotedPostId: { $ne: null } })
      .exec();
    const promotedPostObjectIds = promotedPostIdsRaw
      .map((id) => String(id ?? ''))
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const query: Record<string, any> = {
      deletedAt: null,
    };

    if (promotedPostObjectIds.length) {
      query.$nor = [
        { _id: { $in: promotedPostObjectIds } },
        { repostOf: { $in: promotedPostObjectIds } },
      ];
    }

    if (params.state && params.state !== 'all') {
      query.moderationState = params.state;
    }

    if (params.type && params.type !== 'all') {
      query.kind = params.type;
    }

    if (params.visibility && params.visibility !== 'all') {
      query.visibility = params.visibility;
    }

    if (params.autoHidden === 'yes') {
      query.autoHiddenPendingReview = true;
    }
    if (params.autoHidden === 'no') {
      query.autoHiddenPendingReview = false;
    }

    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const orFilters: Array<Record<string, any>> = [{ content: regex }];

      if (Types.ObjectId.isValid(q)) {
        const objectId = new Types.ObjectId(q);
        orFilters.push({ _id: objectId }, { authorId: objectId });
      }

      const matchedProfiles = await this.profileModel
        .find({ $or: [{ username: regex }, { displayName: regex }] })
        .select('userId')
        .lean();
      const matchedUserIds = matchedProfiles
        .map((profile: any) => profile?.userId)
        .filter((id: any) => Boolean(id));
      if (matchedUserIds.length) {
        orFilters.push({ authorId: { $in: matchedUserIds } });
      }

      query.$or = orFilters;
    }

    const docs = await this.postModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(safeOffset)
      .limit(safeLimit + 1)
      .select(
        '_id authorId content media visibility moderationState autoHiddenPendingReview createdAt',
      )
      .lean();

    const hasMore = docs.length > safeLimit;
    const slicedDocs = hasMore ? docs.slice(0, safeLimit) : docs;

    const authorIds = Array.from(
      new Set(
        slicedDocs
          .map((doc: any) => doc.authorId?.toString?.())
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
      profiles.map((profile: any) => [profile.userId.toString(), profile]),
    );

    const items = slicedDocs.map((doc: any) => {
      const authorKey = doc.authorId?.toString?.() ?? '';
      const profile = profileMap.get(authorKey);
      const rawContent = typeof doc.content === 'string' ? doc.content : '';

      return {
        postId: doc._id.toString(),
        authorId: authorKey,
        authorDisplayName: profile?.displayName ?? null,
        authorUsername: profile?.username ?? null,
        contentPreview: this.getModerationDisplayContent(rawContent),
        media: Array.isArray(doc.media)
          ? doc.media
              .map((item: any) => ({
                type: item?.type === 'video' ? 'video' : 'image',
                url: typeof item?.url === 'string' ? item.url : '',
                originalUrl:
                  typeof item?.metadata?.originalSecureUrl === 'string'
                    ? item.metadata.originalSecureUrl
                    : typeof item?.metadata?.originalUrl === 'string'
                      ? item.metadata.originalUrl
                      : null,
              }))
              .filter(
                (item: {
                  type: 'image' | 'video';
                  url: string;
                  originalUrl: string | null;
                }) => item.url,
              )
          : [],
        visibility: doc.visibility ?? 'public',
        moderationState: doc.moderationState ?? 'normal',
        autoHiddenPendingReview: Boolean(doc.autoHiddenPendingReview),
        createdAt: doc.createdAt ?? null,
      };
    });

    return {
      items,
      offset: safeOffset,
      limit: safeLimit,
      hasMore,
    };
  }

  async getDirectModerationComments(params: {
    q?: string;
    limit?: number;
    offset?: number;
    state?: string;
    autoHidden?: string;
  }): Promise<{
    items: Array<{
      commentId: string;
      postId: string;
      authorId: string;
      authorDisplayName: string | null;
      authorUsername: string | null;
      contentPreview: string;
      moderationState: string;
      autoHiddenPendingReview: boolean;
      createdAt: Date | null;
    }>;
    offset: number;
    limit: number;
    hasMore: boolean;
  }> {
    const safeLimit = Math.min(Math.max(params.limit ?? 30, 1), 100);
    const safeOffset = Math.max(params.offset ?? 0, 0);
    const q = (params.q ?? '').trim();

    const query: Record<string, any> = {
      deletedAt: null,
    };

    if (params.state && params.state !== 'all') {
      query.moderationState = params.state;
    }

    if (params.autoHidden === 'yes') {
      query.autoHiddenPendingReview = true;
    }
    if (params.autoHidden === 'no') {
      query.autoHiddenPendingReview = false;
    }

    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const orFilters: Array<Record<string, any>> = [{ content: regex }];

      if (Types.ObjectId.isValid(q)) {
        const objectId = new Types.ObjectId(q);
        orFilters.push({ _id: objectId }, { postId: objectId }, { authorId: objectId });
      }

      const matchedProfiles = await this.profileModel
        .find({ $or: [{ username: regex }, { displayName: regex }] })
        .select('userId')
        .lean();
      const matchedUserIds = matchedProfiles
        .map((profile: any) => profile?.userId)
        .filter((id: any) => Boolean(id));
      if (matchedUserIds.length) {
        orFilters.push({ authorId: { $in: matchedUserIds } });
      }

      query.$or = orFilters;
    }

    const docs = await this.commentModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(safeOffset)
      .limit(safeLimit + 1)
      .select(
        '_id postId authorId content moderationState autoHiddenPendingReview createdAt',
      )
      .lean();

    const hasMore = docs.length > safeLimit;
    const slicedDocs = hasMore ? docs.slice(0, safeLimit) : docs;

    const authorIds = Array.from(
      new Set(
        slicedDocs
          .map((doc: any) => doc.authorId?.toString?.())
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
      profiles.map((profile: any) => [profile.userId.toString(), profile]),
    );

    const items = slicedDocs.map((doc: any) => {
      const authorKey = doc.authorId?.toString?.() ?? '';
      const profile = profileMap.get(authorKey);
      const rawContent = typeof doc.content === 'string' ? doc.content : '';
      const preview = rawContent.length > 180 ? `${rawContent.slice(0, 177)}...` : rawContent;

      return {
        commentId: doc._id.toString(),
        postId: doc.postId?.toString?.() ?? '',
        authorId: authorKey,
        authorDisplayName: profile?.displayName ?? null,
        authorUsername: profile?.username ?? null,
        contentPreview: preview,
        moderationState: doc.moderationState ?? 'normal',
        autoHiddenPendingReview: Boolean(doc.autoHiddenPendingReview),
        createdAt: doc.createdAt ?? null,
      };
    });

    return {
      items,
      offset: safeOffset,
      limit: safeLimit,
      hasMore,
    };
  }

  async getDirectModerationUsers(params: {
    q?: string;
    limit?: number;
    offset?: number;
    status?: string;
    risk?: string;
  }): Promise<{
    items: Array<{
      userId: string;
      email: string | null;
      status: string;
      strikeCount: number;
      interactionMutedUntil: Date | null;
      interactionMutedIndefinitely: boolean;
      accountLimitedUntil: Date | null;
      accountLimitedIndefinitely: boolean;
      suspendedUntil: Date | null;
      suspendedIndefinitely: boolean;
      createdAt: Date | null;
      displayName: string | null;
      username: string | null;
      avatarUrl: string | null;
      isCreatorVerified: boolean;
    }>;
    offset: number;
    limit: number;
    hasMore: boolean;
  }> {
    const safeLimit = Math.min(Math.max(params.limit ?? 30, 1), 100);
    const safeOffset = Math.max(params.offset ?? 0, 0);
    const q = (params.q ?? '').trim();

    const query: Record<string, any> = {
      roles: { $nin: ['admin'] },
    };
    const andConditions: Array<Record<string, any>> = [];

    if (params.status && params.status !== 'all') {
      query.status = params.status;
    }

    if (params.risk === 'high_strike') {
      query.strikeCount = { $gte: 3 };
    }
    if (params.risk === 'muted') {
      andConditions.push({
        $or: [
          { interactionMutedIndefinitely: true },
          { interactionMutedUntil: { $gt: new Date() } },
        ],
      });
    }
    if (params.risk === 'limited') {
      andConditions.push({
        $or: [
          { accountLimitedIndefinitely: true },
          { accountLimitedUntil: { $gt: new Date() } },
        ],
      });
    }
    if (params.risk === 'suspended') {
      andConditions.push({
        $or: [
          { suspendedIndefinitely: true },
          { suspendedUntil: { $gt: new Date() } },
        ],
      });
    }

    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const orFilters: Array<Record<string, any>> = [{ email: regex }];

      if (Types.ObjectId.isValid(q)) {
        orFilters.push({ _id: new Types.ObjectId(q) });
      }

      const matchedProfiles = await this.profileModel
        .find({ $or: [{ username: regex }, { displayName: regex }] })
        .select('userId')
        .lean();
      const matchedUserIds = matchedProfiles
        .map((profile: any) => profile?.userId)
        .filter((id: any) => Boolean(id));
      if (matchedUserIds.length) {
        orFilters.push({ _id: { $in: matchedUserIds } });
      }

      andConditions.push({ $or: orFilters });
    }

    if (andConditions.length) {
      query.$and = andConditions;
    }

    const docs = await this.userModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(safeOffset)
      .limit(safeLimit + 1)
      .select(
        '_id email status strikeCount interactionMutedUntil interactionMutedIndefinitely accountLimitedUntil accountLimitedIndefinitely suspendedUntil suspendedIndefinitely createdAt isCreatorVerified',
      )
      .lean();

    const hasMore = docs.length > safeLimit;
    const slicedDocs = hasMore ? docs.slice(0, safeLimit) : docs;

    const userIds = slicedDocs
      .map((doc: any) => doc._id)
      .filter((id: any) => Boolean(id));
    const profiles = userIds.length
      ? await this.profileModel
          .find({ userId: { $in: userIds } })
          .select('userId displayName username avatarUrl')
          .lean()
      : [];

    const profileMap = new Map(
      profiles.map((profile: any) => [profile.userId.toString(), profile]),
    );

    const items = slicedDocs.map((doc: any) => {
      const key = doc._id.toString();
      const profile = profileMap.get(key);
      return {
        userId: key,
        email: typeof doc.email === 'string' ? doc.email : null,
        status: doc.status ?? 'pending',
        strikeCount: Number.isFinite(doc.strikeCount) ? doc.strikeCount : 0,
        interactionMutedUntil: doc.interactionMutedUntil ?? null,
        interactionMutedIndefinitely: Boolean(doc.interactionMutedIndefinitely),
        accountLimitedUntil: doc.accountLimitedUntil ?? null,
        accountLimitedIndefinitely: Boolean(doc.accountLimitedIndefinitely),
        suspendedUntil: doc.suspendedUntil ?? null,
        suspendedIndefinitely: Boolean(doc.suspendedIndefinitely),
        createdAt: doc.createdAt ?? null,
        displayName: profile?.displayName ?? null,
        username: profile?.username ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
        isCreatorVerified: Boolean(doc.isCreatorVerified),
      };
    });

    return {
      items,
      offset: safeOffset,
      limit: safeLimit,
      hasMore,
    };
  }

  async getDirectModerationTargetDetail(type: string, targetId: string): Promise<any> {
    if (!['post', 'comment', 'user'].includes(type)) {
      throw new BadRequestException('Unsupported target type');
    }
    if (!Types.ObjectId.isValid(targetId)) {
      throw new BadRequestException('Invalid target id');
    }

    const objectId = new Types.ObjectId(targetId);

    if (type === 'post') {
      const post = await this.postModel
        .findById(objectId)
        .select('authorId content media visibility moderationState autoHiddenPendingReview createdAt')
        .lean();
      if (!post) {
        throw new NotFoundException('Post not found');
      }

      const profile = await this.profileModel
        .findOne({ userId: post.authorId })
        .select('displayName username avatarUrl')
        .lean();

      return {
        type: 'post',
        targetId,
        author: {
          userId: post.authorId?.toString?.() ?? '',
          displayName: profile?.displayName ?? null,
          username: profile?.username ?? null,
          avatarUrl: profile?.avatarUrl ?? null,
        },
        post: {
          caption: this.getModerationDisplayContent(
            typeof post.content === 'string' ? post.content : '',
          ),
          visibility: post.visibility ?? 'public',
          moderationState: post.moderationState ?? 'normal',
          autoHiddenPendingReview: Boolean(post.autoHiddenPendingReview),
          createdAt: post.createdAt ?? null,
          media: Array.isArray(post.media)
            ? post.media
                .map((item: any) => ({
                  type: item?.type === 'video' ? 'video' : 'image',
                  url: typeof item?.url === 'string' ? item.url : '',
                  originalUrl:
                    typeof item?.metadata?.originalSecureUrl === 'string'
                      ? item.metadata.originalSecureUrl
                      : typeof item?.metadata?.originalUrl === 'string'
                        ? item.metadata.originalUrl
                        : null,
                }))
                .filter((item: { url: string }) => Boolean(item.url))
            : [],
        },
      };
    }

    if (type === 'comment') {
      const comment = await this.commentModel
        .findById(objectId)
        .select('postId authorId content media moderationState autoHiddenPendingReview createdAt')
        .lean();
      if (!comment) {
        throw new NotFoundException('Comment not found');
      }

      const [profile, parentPost] = await Promise.all([
        this.profileModel
          .findOne({ userId: comment.authorId })
          .select('displayName username avatarUrl')
          .lean(),
        comment.postId
          ? this.postModel
              .findById(comment.postId)
              .select('content media')
              .lean()
          : null,
      ]);

      return {
        type: 'comment',
        targetId,
        author: {
          userId: comment.authorId?.toString?.() ?? '',
          displayName: profile?.displayName ?? null,
          username: profile?.username ?? null,
          avatarUrl: profile?.avatarUrl ?? null,
        },
        comment: {
          postId: comment.postId?.toString?.() ?? '',
          content: typeof comment.content === 'string' ? comment.content : '',
          moderationState: comment.moderationState ?? 'normal',
          autoHiddenPendingReview: Boolean(comment.autoHiddenPendingReview),
          createdAt: comment.createdAt ?? null,
          media:
            comment.media && typeof comment.media === 'object'
              ? [
                  {
                    type: (comment.media as any)?.type === 'video' ? 'video' : 'image',
                    url: typeof (comment.media as any)?.url === 'string' ? (comment.media as any).url : '',
                    originalUrl:
                      typeof (comment.media as any)?.metadata?.originalSecureUrl === 'string'
                        ? (comment.media as any).metadata.originalSecureUrl
                        : typeof (comment.media as any)?.metadata?.originalUrl === 'string'
                          ? (comment.media as any).metadata.originalUrl
                          : null,
                  },
                ].filter((item) => Boolean(item.url))
              : [],
        },
        contextPost: parentPost
          ? {
              postId: parentPost._id.toString(),
              caption: this.getModerationDisplayContent(
                typeof parentPost.content === 'string'
                  ? parentPost.content
                  : '',
              ),
              media: Array.isArray((parentPost as any).media)
                ? (parentPost as any).media
                    .map((item: any) => ({
                      type: item?.type === 'video' ? 'video' : 'image',
                      url: typeof item?.url === 'string' ? item.url : '',
                      originalUrl:
                        typeof item?.metadata?.originalSecureUrl === 'string'
                          ? item.metadata.originalSecureUrl
                          : typeof item?.metadata?.originalUrl === 'string'
                            ? item.metadata.originalUrl
                            : null,
                    }))
                    .filter((item: { url: string }) => Boolean(item.url))
                : [],
            }
          : null,
      };
    }

    const user = await this.userModel
      .findById(objectId)
      .select(
        'email status strikeCount interactionMutedUntil interactionMutedIndefinitely accountLimitedUntil accountLimitedIndefinitely suspendedUntil suspendedIndefinitely createdAt',
      )
      .lean();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const profile = await this.profileModel
      .findOne({ userId: user._id })
      .select('displayName username avatarUrl')
      .lean();

    return {
      type: 'user',
      targetId,
      user: {
        userId: user._id.toString(),
        email: user.email ?? null,
        status: user.status ?? 'active',
        strikeCount: Number(user.strikeCount ?? 0),
        interactionMutedUntil: user.interactionMutedUntil ?? null,
        interactionMutedIndefinitely: Boolean(user.interactionMutedIndefinitely),
        accountLimitedUntil: user.accountLimitedUntil ?? null,
        accountLimitedIndefinitely: Boolean(user.accountLimitedIndefinitely),
        suspendedUntil: user.suspendedUntil ?? null,
        suspendedIndefinitely: Boolean(user.suspendedIndefinitely),
        createdAt: user.createdAt ?? null,
        displayName: profile?.displayName ?? null,
        username: profile?.username ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
      },
    };
  }

  async moderateContentDirect(params: {
    type: 'post' | 'comment' | 'user';
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
  }): Promise<{ status: 'ok' }> {
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

    const normalizedType = type === 'comment' || type === 'user' ? type : 'post';
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

    // If this target still has open reports, run the exact resolve-report pipeline
    // so audit, strike, notifications, and status transitions stay fully consistent.
    const reportFlowResult = await this.resolveReportAction({
      type: normalizedType,
      targetId,
      action: resolvedAction,
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
    });
    if (reportFlowResult.status === 'ok') {
      return { status: 'ok' };
    }

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
                autoHiddenPendingReview: false,
                autoHiddenAt: null,
                autoHiddenUntil: null,
                autoHiddenEscalatedAt: null,
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
                autoHiddenPendingReview: false,
                autoHiddenAt: null,
                autoHiddenUntil: null,
                autoHiddenEscalatedAt: null,
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

      if (
        ['no_violation', 'warn', 'violation', 'mute_interaction'].includes(
          resolvedAction,
        )
      ) {
        await this.postModel
          .updateOne(
            { _id: targetObjectId },
            {
              $set: {
                moderationState: 'normal',
                autoHiddenPendingReview: false,
                autoHiddenAt: null,
                autoHiddenUntil: null,
                autoHiddenEscalatedAt: null,
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

        await this.commentModel
          .updateOne(
            { _id: targetObjectId },
            {
              $set: {
                autoHiddenPendingReview: false,
                autoHiddenAt: null,
                autoHiddenUntil: null,
                autoHiddenEscalatedAt: null,
              },
            },
          )
          .exec();
      }

      if (
        ['no_violation', 'warn', 'violation', 'mute_interaction'].includes(
          resolvedAction,
        )
      ) {
        await this.commentModel
          .updateOne(
            { _id: targetObjectId },
            {
              $set: {
                moderationState: 'normal',
                autoHiddenPendingReview: false,
                autoHiddenAt: null,
                autoHiddenUntil: null,
                autoHiddenEscalatedAt: null,
              },
            },
          )
          .exec();
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
                autoHiddenPendingReview: false,
                autoHiddenAt: null,
                autoHiddenUntil: null,
                autoHiddenEscalatedAt: null,
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
                autoHiddenPendingReview: false,
                autoHiddenAt: null,
                autoHiddenUntil: null,
                autoHiddenEscalatedAt: null,
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

      if (
        ['no_violation', 'warn', 'violation', 'mute_interaction'].includes(
          resolvedAction,
        )
      ) {
        await this.postModel
          .updateOne(
            { _id: targetObjectId, autoHiddenPendingReview: true },
            {
              $set: {
                moderationState: 'normal',
                autoHiddenPendingReview: false,
                autoHiddenAt: null,
                autoHiddenUntil: null,
                autoHiddenEscalatedAt: null,
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

        await this.commentModel
          .updateOne(
            { _id: targetObjectId },
            {
              $set: {
                autoHiddenPendingReview: false,
                autoHiddenAt: null,
                autoHiddenUntil: null,
                autoHiddenEscalatedAt: null,
              },
            },
          )
          .exec();
      }

      if (
        ['no_violation', 'warn', 'violation', 'mute_interaction'].includes(
          resolvedAction,
        )
      ) {
        await this.commentModel
          .updateOne(
            { _id: targetObjectId, autoHiddenPendingReview: true },
            {
              $set: {
                moderationState: 'normal',
                autoHiddenPendingReview: false,
                autoHiddenAt: null,
                autoHiddenUntil: null,
                autoHiddenEscalatedAt: null,
              },
            },
          )
          .exec();
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

  async rollbackAutoHiddenAndDismiss(params: {
    type: string;
    targetId: string;
    note?: string | null;
    adminId: string;
  }): Promise<{ status: 'ok' | 'already_resolved' }> {
    const normalizedType =
      params.type === 'comment'
        ? 'comment'
        : params.type === 'post'
          ? 'post'
          : null;
    if (!normalizedType) {
      throw new BadRequestException('Rollback is only available for post/comment');
    }
    if (!Types.ObjectId.isValid(params.targetId)) {
      throw new BadRequestException('Invalid target id');
    }

    const targetObjectId = new Types.ObjectId(params.targetId);
    if (normalizedType === 'post') {
      const post = await this.postModel
        .findById(targetObjectId)
        .select('_id autoHiddenPendingReview')
        .lean();
      if (!post?._id) {
        throw new NotFoundException('Post not found');
      }
      if (!post.autoHiddenPendingReview) {
        throw new BadRequestException('Post is not in auto-hidden pending state');
      }
      await this.postModel
        .updateOne(
          { _id: targetObjectId },
          {
            $set: {
              moderationState: 'normal',
              autoHiddenPendingReview: false,
              autoHiddenAt: null,
              autoHiddenUntil: null,
              autoHiddenEscalatedAt: null,
              deletedAt: null,
              deletedBy: null,
              deletedSource: null,
              deletedReason: null,
            },
          },
        )
        .exec();
    }

    if (normalizedType === 'comment') {
      const comment = await this.commentModel
        .findById(targetObjectId)
        .select('_id autoHiddenPendingReview')
        .lean();
      if (!comment?._id) {
        throw new NotFoundException('Comment not found');
      }
      if (!comment.autoHiddenPendingReview) {
        throw new BadRequestException('Comment is not in auto-hidden pending state');
      }
      await this.commentModel
        .updateOne(
          { _id: targetObjectId },
          {
            $set: {
              moderationState: 'normal',
              autoHiddenPendingReview: false,
              autoHiddenAt: null,
              autoHiddenUntil: null,
              autoHiddenEscalatedAt: null,
            },
          },
        )
        .exec();
    }

    return this.resolveReportAction({
      type: normalizedType,
      targetId: params.targetId,
      action: 'no_violation',
      category: 'other',
      reason: 'no_violation',
      note: params.note ?? 'Rollback auto-hidden content and mark no violation',
      adminId: params.adminId,
    });
  }
}
