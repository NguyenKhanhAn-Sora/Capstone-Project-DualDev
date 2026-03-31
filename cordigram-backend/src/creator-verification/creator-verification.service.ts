import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../users/user.schema';
import { Profile } from '../profiles/profile.schema';
import { Post } from '../posts/post.schema';
import { ModerationAction } from '../moderation/moderation-action.schema';
import {
  CreatorEligibilitySnapshot,
  CreatorVerificationRequest,
} from './creator-verification.schema';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentTransaction } from '../payments/payment-transaction.schema';

const CRITERIA = {
  minScore: 70,
  minAccountAgeDays: 60,
  minFollowersCount: 100,
  minPostsCount: 300,
  minActivePostingDays30d: 8,
  minEngagementPerPost30d: 8,
  maxRecentViolations90d: 2,
  cooldownDaysAfterRejected: 30,
} as const;

const SCORE_WEIGHTS = {
  followers: 0.25,
  posts: 0.2,
  consistency: 0.2,
  engagement: 0.25,
  trust: 0.1,
} as const;

// Environment flag:
// - true  => require eligibility/cooldown checks before submit
// - false => bypass eligibility/cooldown checks for testing submit flow
const CREATOR_VERIFICATION_REQUIRE_ELIGIBILITY =
  process.env.CREATOR_VERIFICATION_REQUIRE_ELIGIBILITY !== 'false';

const clampPercent = (value: number) => {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value > 100) return 100;
  return value;
};

const normalizeId = (value: Types.ObjectId | string | null | undefined) =>
  value ? value.toString() : '';

const extractUserIdFromRef = (
  value: Types.ObjectId | { _id?: Types.ObjectId } | null | undefined,
) => {
  if (!value) return '';
  if (value instanceof Types.ObjectId) {
    return value.toString();
  }
  return value._id ? value._id.toString() : '';
};

type CreatorVerificationAuditAction =
  | 'creator_verification_approved'
  | 'creator_verification_rejected'
  | 'creator_verification_revoked';

@Injectable()
export class CreatorVerificationService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Profile.name) private readonly profileModel: Model<Profile>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(PaymentTransaction.name)
    private readonly paymentTransactionModel: Model<PaymentTransaction>,
    @InjectModel(ModerationAction.name)
    private readonly moderationActionModel: Model<ModerationAction>,
    @InjectModel(CreatorVerificationRequest.name)
    private readonly requestModel: Model<CreatorVerificationRequest>,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async createCreatorVerificationAuditLog(params: {
    adminId: string;
    userId: Types.ObjectId;
    action: CreatorVerificationAuditAction;
    reason: string;
    note?: string | null;
  }) {
    await this.moderationActionModel.create({
      targetType: 'user',
      targetId: params.userId,
      action: params.action,
      category: 'creator_verification',
      reason: params.reason,
      severity: null,
      note: params.note?.trim() || null,
      moderatorId: new Types.ObjectId(params.adminId),
      expiresAt: null,
    });
  }

  private async buildEligibilitySnapshot(
    userId: string,
  ): Promise<CreatorEligibilitySnapshot> {
    const userObjectId = new Types.ObjectId(userId);
    const [user, profile] = await Promise.all([
      this.userModel
        .findById(userObjectId)
        .select(
          'createdAt followerCount roles isCreatorVerified creatorVerificationApprovedAt email',
        )
        .lean(),
      this.profileModel
        .findOne({ userId: userObjectId })
        .select('stats')
        .lean(),
    ]);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const accountAgeMs =
      Date.now() - new Date(user.createdAt ?? Date.now()).getTime();
    const accountAgeDays = Math.max(
      0,
      Math.floor(accountAgeMs / (24 * 60 * 60 * 1000)),
    );

    const followersCount = Math.max(
      0,
      Number(profile?.stats?.followersCount ?? user.followerCount ?? 0),
    );
    const postsCount = Math.max(0, Number(profile?.stats?.postsCount ?? 0));

    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const engagementStats = await this.postModel
      .aggregate<{
        totalPosts: number;
        activeDays: string[];
        totalEngagement: number;
      }>([
        {
          $match: {
            authorId: userObjectId,
            status: 'published',
            moderationState: { $ne: 'removed' },
            createdAt: { $gte: since30d },
          },
        },
        {
          $group: {
            _id: null,
            totalPosts: { $sum: 1 },
            activeDays: {
              $addToSet: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt',
                },
              },
            },
            totalEngagement: {
              $sum: {
                $add: [
                  { $ifNull: ['$stats.hearts', 0] },
                  { $ifNull: ['$stats.comments', 0] },
                  { $ifNull: ['$stats.saves', 0] },
                  { $ifNull: ['$stats.reposts', 0] },
                  { $ifNull: ['$stats.shares', 0] },
                ],
              },
            },
          },
        },
      ])
      .exec();

    const agg = engagementStats[0];
    const activePostingDays30d = agg?.activeDays?.length ?? 0;
    const recentPosts = agg?.totalPosts ?? 0;
    const totalEngagement = agg?.totalEngagement ?? 0;
    const engagementPerPost30d = recentPosts
      ? Number((totalEngagement / recentPosts).toFixed(2))
      : 0;

    const since90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const recentViolations90d = await this.moderationActionModel
      .countDocuments({
        targetType: 'user',
        targetId: userObjectId,
        invalidatedAt: null,
        createdAt: { $gte: since90d },
        action: {
          $in: [
            'warn',
            'mute_interaction',
            'suspend_user',
            'limit_account',
            'violation',
          ],
        },
      })
      .exec();

    const followersScore = clampPercent(
      (followersCount / CRITERIA.minFollowersCount) * 100,
    );
    const postsScore = clampPercent(
      (postsCount / CRITERIA.minPostsCount) * 100,
    );
    const consistencyScore = clampPercent(
      (activePostingDays30d / CRITERIA.minActivePostingDays30d) * 100,
    );
    const engagementScore = clampPercent(
      (engagementPerPost30d / CRITERIA.minEngagementPerPost30d) * 100,
    );
    const trustScore = clampPercent(
      100 -
        (recentViolations90d / Math.max(CRITERIA.maxRecentViolations90d, 1)) *
          100,
    );

    const weightedScore =
      followersScore * SCORE_WEIGHTS.followers +
      postsScore * SCORE_WEIGHTS.posts +
      consistencyScore * SCORE_WEIGHTS.consistency +
      engagementScore * SCORE_WEIGHTS.engagement +
      trustScore * SCORE_WEIGHTS.trust;

    const score = Number(weightedScore.toFixed(2));

    const failedRequirements: string[] = [];
    if (accountAgeDays < CRITERIA.minAccountAgeDays) {
      failedRequirements.push('account_age');
    }
    if (followersCount < CRITERIA.minFollowersCount) {
      failedRequirements.push('followers_count');
    }
    if (postsCount < CRITERIA.minPostsCount) {
      failedRequirements.push('posts_count');
    }
    if (activePostingDays30d < CRITERIA.minActivePostingDays30d) {
      failedRequirements.push('active_posting_days_30d');
    }
    if (engagementPerPost30d < CRITERIA.minEngagementPerPost30d) {
      failedRequirements.push('engagement_per_post_30d');
    }
    if (recentViolations90d > CRITERIA.maxRecentViolations90d) {
      failedRequirements.push('recent_violations_90d');
    }
    if (score < CRITERIA.minScore) {
      failedRequirements.push('score');
    }

    return {
      score,
      minimumScore: CRITERIA.minScore,
      accountAgeDays,
      minAccountAgeDays: CRITERIA.minAccountAgeDays,
      followersCount,
      minFollowersCount: CRITERIA.minFollowersCount,
      postsCount,
      minPostsCount: CRITERIA.minPostsCount,
      activePostingDays30d,
      minActivePostingDays30d: CRITERIA.minActivePostingDays30d,
      engagementPerPost30d,
      minEngagementPerPost30d: CRITERIA.minEngagementPerPost30d,
      recentViolations90d,
      maxRecentViolations90d: CRITERIA.maxRecentViolations90d,
      eligible: failedRequirements.length === 0,
      failedRequirements,
    };
  }

  private async getLatestRequest(userId: string) {
    return this.requestModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getMyStatus(userId: string) {
    const [snapshot, latest, user] = await Promise.all([
      this.buildEligibilitySnapshot(userId),
      this.getLatestRequest(userId),
      this.userModel
        .findById(new Types.ObjectId(userId))
        .select('roles isCreatorVerified creatorVerificationApprovedAt')
        .lean(),
    ]);

    const now = Date.now();
    const inCooldown = Boolean(
      latest?.status === 'rejected' &&
      latest?.cooldownUntil &&
      new Date(latest.cooldownUntil).getTime() > now,
    );

    const canRequest = Boolean(
      !user?.isCreatorVerified &&
      latest?.status !== 'pending' &&
      (!CREATOR_VERIFICATION_REQUIRE_ELIGIBILITY ||
        (snapshot.eligible && !inCooldown)),
    );

    return {
      criteria: CRITERIA,
      eligibility: snapshot,
      account: {
        isCreatorVerified: Boolean(user?.isCreatorVerified),
        creatorVerifiedAt: user?.creatorVerificationApprovedAt ?? null,
        roles: user?.roles ?? [],
      },
      latestRequest: latest
        ? {
            id: normalizeId(latest._id),
            status: latest.status,
            requestNote: latest.requestNote,
            decisionReason: latest.decisionReason ?? null,
            reviewedAt: latest.reviewedAt ?? null,
            cooldownUntil: latest.cooldownUntil ?? null,
            createdAt: latest.createdAt ?? null,
          }
        : null,
      canRequest,
    };
  }

  async submitRequest(userId: string, requestNote?: string) {
    const status = await this.getMyStatus(userId);
    if (status.account.isCreatorVerified) {
      throw new BadRequestException('Your account is already creator verified');
    }
    if (!status.canRequest) {
      if (status.latestRequest?.status === 'pending') {
        throw new BadRequestException('You already have a pending request');
      }
      if (
        status.latestRequest?.status === 'rejected' &&
        status.latestRequest.cooldownUntil
      ) {
        throw new BadRequestException(
          `Please wait until ${new Date(status.latestRequest.cooldownUntil).toISOString()} to request again`,
        );
      }
      throw new BadRequestException(
        'You are not eligible to request creator verification yet',
      );
    }

    const newRequest = await this.requestModel.create({
      userId: new Types.ObjectId(userId),
      status: 'pending',
      requestNote: (requestNote ?? '').trim(),
      eligibility: status.eligibility,
    });

    return {
      id: normalizeId(newRequest._id),
      status: newRequest.status,
      createdAt: newRequest.createdAt,
      requestNote: newRequest.requestNote,
    };
  }

  async listRequestsForAdmin(params: {
    status?: 'pending' | 'approved' | 'rejected';
    limit?: number;
    cursor?: string | null;
    startDate?: string;
    endDate?: string;
    sort?: 'asc' | 'desc';
  }) {
    const safeLimit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const query: Record<string, unknown> = {};
    const sortDirection = params.sort === 'asc' ? 1 : -1;
    if (params.status) {
      query.status = params.status;
    }

    const createdAtQuery: Record<string, Date> = {};

    if (params.startDate) {
      const start = new Date(params.startDate);
      if (!Number.isNaN(start.getTime())) {
        start.setHours(0, 0, 0, 0);
        createdAtQuery.$gte = start;
      }
    }

    if (params.endDate) {
      const end = new Date(params.endDate);
      if (!Number.isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        createdAtQuery.$lte = end;
      }
    }

    if (params.cursor) {
      const cursorDate = new Date(params.cursor);
      if (!Number.isNaN(cursorDate.getTime())) {
        if (sortDirection === 1) {
          createdAtQuery.$gt = cursorDate;
        } else {
          createdAtQuery.$lt = cursorDate;
        }
      }
    }

    if (Object.keys(createdAtQuery).length > 0) {
      query.createdAt = createdAtQuery;
    }

    const rows = await this.requestModel
      .find(query)
      .sort({ createdAt: sortDirection })
      .limit(safeLimit)
      .populate(
        'userId',
        'email roles isCreatorVerified creatorVerificationApprovedAt createdAt',
      )
      .lean();

    const userIds = rows
      .map((row) =>
        extractUserIdFromRef(
          row.userId as Types.ObjectId | { _id?: Types.ObjectId },
        ),
      )
      .filter(Boolean)
      .map((id) => new Types.ObjectId(id));

    const profiles = userIds.length
      ? await this.profileModel
          .find({ userId: { $in: userIds } })
          .select('userId displayName username avatarUrl stats')
          .lean()
      : [];

    const profileByUserId = new Map(
      profiles.map((item) => [normalizeId(item.userId), item]),
    );

    const items = rows.map((row) => {
      const userId = extractUserIdFromRef(
        row.userId as Types.ObjectId | { _id?: Types.ObjectId },
      );
      const profile = profileByUserId.get(userId);
      return {
        id: normalizeId(row._id),
        status: row.status,
        requestNote: row.requestNote,
        decisionReason: row.decisionReason ?? null,
        reviewedAt: row.reviewedAt ?? null,
        createdAt: row.createdAt ?? null,
        cooldownUntil: row.cooldownUntil ?? null,
        eligibility: row.eligibility,
        user: {
          id: userId,
          email: (row.userId as { email?: string })?.email ?? null,
          roles: (row.userId as { roles?: string[] })?.roles ?? [],
          isCreatorVerified: Boolean(
            (row.userId as { isCreatorVerified?: boolean })?.isCreatorVerified,
          ),
          creatorVerifiedAt:
            (row.userId as { creatorVerificationApprovedAt?: Date | null })
              ?.creatorVerificationApprovedAt ?? null,
          displayName: profile?.displayName ?? null,
          username: profile?.username ?? null,
          avatarUrl: profile?.avatarUrl ?? null,
          followersCount: profile?.stats?.followersCount ?? 0,
          postsCount: profile?.stats?.postsCount ?? 0,
        },
      };
    });

    return {
      items,
      nextCursor:
        items.length === safeLimit
          ? (items[items.length - 1]?.createdAt ?? null)
          : null,
    };
  }

  async getRequestDetailForAdmin(requestId: string) {
    const request = await this.requestModel
      .findById(requestId)
      .populate(
        'userId',
        'email roles isCreatorVerified creatorVerificationApprovedAt createdAt',
      )
      .lean();

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    const userId = extractUserIdFromRef(
      request.userId as Types.ObjectId | { _id?: Types.ObjectId },
    );

    if (!userId) {
      throw new NotFoundException('User not found');
    }

    const userObjectId = new Types.ObjectId(userId);

    const [
      profile,
      currentEligibility,
      recentPublicPosts,
      recentModerationActions,
      activeActionCount,
      creatorReviewHistory,
      creatorRevokeHistory,
    ] = await Promise.all([
      this.profileModel
        .findOne({ userId: userObjectId })
        .select('displayName username avatarUrl bio location workplace stats')
        .lean(),
      this.buildEligibilitySnapshot(userId),
      this.postModel
        .find({
          authorId: userObjectId,
          status: 'published',
          visibility: 'public',
          kind: { $in: ['post', 'reel'] },
          moderationState: { $ne: 'removed' },
          deletedAt: null,
        })
        .sort({ createdAt: -1 })
        .limit(20)
        .select('kind content media stats visibility moderationState createdAt')
        .lean(),
      this.moderationActionModel
        .find({
          targetType: 'user',
          targetId: userObjectId,
          invalidatedAt: null,
        })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('action category reason severity note expiresAt createdAt')
        .lean(),
      this.moderationActionModel.countDocuments({
        targetType: 'user',
        targetId: userObjectId,
        invalidatedAt: null,
      }),
      this.requestModel
        .find({
          userId: userObjectId,
          reviewedAt: { $ne: null },
          status: { $in: ['approved', 'rejected'] },
        })
        .sort({ reviewedAt: -1, createdAt: -1 })
        .select('status decisionReason reviewedAt reviewedBy createdAt')
        .lean(),
      this.moderationActionModel
        .find({
          targetType: 'user',
          targetId: userObjectId,
          invalidatedAt: null,
          action: 'creator_verification_revoked',
        })
        .sort({ createdAt: -1 })
        .select('action note moderatorId createdAt')
        .lean(),
    ]);

    const recentPostIds = recentPublicPosts
      .map((post) => normalizeId(post._id))
      .filter(Boolean);

    const promotedPostIds = recentPostIds.length
      ? new Set(
          (
            await this.paymentTransactionModel
              .find({
                promotedPostId: { $in: recentPostIds },
                $or: [
                  { paymentStatus: 'paid' },
                  { paymentStatus: 'no_payment_required' },
                  { checkoutStatus: 'complete' },
                ],
              })
              .select('promotedPostId')
              .lean()
          )
            .map((row) => String(row.promotedPostId ?? '').trim())
            .filter(Boolean),
        )
      : new Set<string>();

    const organicRecentPublicPosts = recentPublicPosts
      .filter((post) => !promotedPostIds.has(normalizeId(post._id)))
      .slice(0, 5);

    const historyAdminIds = Array.from(
      new Set(
        [
          ...creatorReviewHistory.map((item) => normalizeId(item.reviewedBy)),
          ...creatorRevokeHistory.map((item) => normalizeId(item.moderatorId)),
        ].filter(Boolean),
      ),
    ).map((id) => new Types.ObjectId(id));

    const [historyAdminProfiles, historyAdminUsers] = historyAdminIds.length
      ? await Promise.all([
          this.profileModel
            .find({ userId: { $in: historyAdminIds } })
            .select('userId displayName username')
            .lean(),
          this.userModel
            .find({ _id: { $in: historyAdminIds } })
            .select('_id email')
            .lean(),
        ])
      : [[], []];

    const historyAdminProfileMap = new Map(
      historyAdminProfiles.map((item) => [normalizeId(item.userId), item]),
    );
    const historyAdminUserMap = new Map(
      historyAdminUsers.map((item) => [normalizeId(item._id), item]),
    );

    const getHistoryActor = (
      adminId: Types.ObjectId | string | null | undefined,
    ) => {
      const normalizedAdminId = normalizeId(adminId);
      if (!normalizedAdminId) {
        return {
          id: null,
          displayName: null,
          username: null,
          email: null,
        };
      }

      const profileDoc = historyAdminProfileMap.get(normalizedAdminId);
      const userDoc = historyAdminUserMap.get(normalizedAdminId);

      return {
        id: normalizedAdminId,
        displayName: profileDoc?.displayName ?? null,
        username: profileDoc?.username ?? null,
        email: userDoc?.email ?? null,
      };
    };

    const creatorVerificationHistory = [
      ...creatorReviewHistory.map((item) => ({
        id: normalizeId(item._id),
        action: item.status === 'approved' ? 'approved' : 'rejected',
        note: item.decisionReason ?? null,
        occurredAt: item.reviewedAt ?? item.createdAt ?? null,
        actor: getHistoryActor(item.reviewedBy),
      })),
      ...creatorRevokeHistory.map((item) => ({
        id: normalizeId(item._id),
        action: 'revoked',
        note: item.note ?? null,
        occurredAt: item.createdAt ?? null,
        actor: getHistoryActor(item.moderatorId),
      })),
    ].sort((a, b) => {
      const aTime = a.occurredAt ? new Date(a.occurredAt).getTime() : 0;
      const bTime = b.occurredAt ? new Date(b.occurredAt).getTime() : 0;
      return bTime - aTime;
    });

    const userRef = request.userId as {
      email?: string;
      roles?: string[];
      isCreatorVerified?: boolean;
      creatorVerificationApprovedAt?: Date | null;
      createdAt?: Date | null;
    };

    return {
      id: normalizeId(request._id),
      status: request.status,
      requestNote: request.requestNote,
      decisionReason: request.decisionReason ?? null,
      reviewedAt: request.reviewedAt ?? null,
      createdAt: request.createdAt ?? null,
      cooldownUntil: request.cooldownUntil ?? null,
      eligibility: request.eligibility,
      currentEligibility,
      user: {
        id: userId,
        email: userRef.email ?? null,
        roles: userRef.roles ?? [],
        isCreatorVerified: Boolean(userRef.isCreatorVerified),
        creatorVerifiedAt: userRef.creatorVerificationApprovedAt ?? null,
        createdAt: userRef.createdAt ?? null,
      },
      profile: {
        displayName: profile?.displayName ?? null,
        username: profile?.username ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
        bio: profile?.bio ?? '',
        location: profile?.location ?? '',
        workplace: profile?.workplace?.companyName ?? '',
        stats: {
          followersCount: profile?.stats?.followersCount ?? 0,
          followingCount: profile?.stats?.followingCount ?? 0,
          postsCount: profile?.stats?.postsCount ?? 0,
        },
      },
      recentPublicPosts: organicRecentPublicPosts.map((post) => ({
        id: normalizeId(post._id),
        kind: post.kind,
        content: (post.content ?? '').slice(0, 240),
        mediaCount: Array.isArray(post.media) ? post.media.length : 0,
        coverUrl:
          Array.isArray(post.media) && post.media.length
            ? (post.media[0]?.url ?? null)
            : null,
        media: Array.isArray(post.media)
          ? post.media.map((item) => ({
              type: item?.type === 'video' ? 'video' : 'image',
              url: typeof item?.url === 'string' ? item.url : null,
              originalUrl:
                typeof item?.metadata?.['originalSecureUrl'] === 'string'
                  ? item.metadata?.['originalSecureUrl']
                  : typeof item?.metadata?.['originalUrl'] === 'string'
                    ? item.metadata?.['originalUrl']
                    : null,
            }))
          : [],
        createdAt: post.createdAt ?? null,
        visibility: post.visibility,
        moderationState: post.moderationState ?? 'normal',
        stats: {
          hearts: post.stats?.hearts ?? 0,
          comments: post.stats?.comments ?? 0,
          saves: post.stats?.saves ?? 0,
          reposts: post.stats?.reposts ?? 0,
          shares: post.stats?.shares ?? 0,
          reports: post.stats?.reports ?? 0,
        },
      })),
      moderationSummary: {
        activeActionCount,
        recentViolations90d: currentEligibility.recentViolations90d,
        latestActions: recentModerationActions.map((action) => ({
          id: normalizeId(action._id),
          action: action.action,
          category: action.category,
          reason: action.reason,
          severity: action.severity ?? null,
          note: action.note ?? null,
          expiresAt: action.expiresAt ?? null,
          createdAt: action.createdAt ?? null,
        })),
      },
      creatorVerificationHistory,
    };
  }

  async reviewRequest(params: {
    adminId: string;
    requestId: string;
    decision: 'approved' | 'rejected';
    decisionReason?: string;
  }) {
    const request = await this.requestModel.findById(params.requestId);
    if (!request) {
      throw new NotFoundException('Request not found');
    }
    if (request.status !== 'pending') {
      throw new BadRequestException('Only pending requests can be reviewed');
    }

    const user = await this.userModel
      .findById(request.userId)
      .select('email roles isCreatorVerified');
    if (!user) {
      throw new NotFoundException('User not found');
    }

    request.status = params.decision;
    request.reviewedBy = new Types.ObjectId(params.adminId);
    request.reviewedAt = new Date();
    request.decisionReason = (params.decisionReason ?? '').trim() || null;

    if (params.decision === 'approved') {
      request.cooldownUntil = null;
      user.isCreatorVerified = true;
      user.set('creatorVerificationApprovedAt', new Date());
      const roleSet = new Set(user.roles ?? []);
      roleSet.add('creator');
      user.roles = Array.from(roleSet) as Array<'user' | 'creator' | 'admin'>;
      await user.save();

      await this.mailService.sendCreatorVerificationApprovedEmail({
        email: user.email,
        displayName: '',
      });

      await this.notificationsService.createSystemNoticeNotification({
        recipientId: user._id.toString(),
        title: 'Creator verification approved',
        body: 'Congratulations. Your creator verification request has been approved and your blue badge is now active.',
        level: 'info',
        actionUrl: '/settings?section=verification',
      });

      await this.createCreatorVerificationAuditLog({
        adminId: params.adminId,
        userId: user._id,
        action: 'creator_verification_approved',
        reason: 'approve_creator_verification',
        note: request.decisionReason,
      });
    } else {
      request.cooldownUntil = new Date(
        Date.now() + CRITERIA.cooldownDaysAfterRejected * 24 * 60 * 60 * 1000,
      );
      await this.mailService.sendCreatorVerificationRejectedEmail({
        email: user.email,
        reason: request.decisionReason,
        cooldownUntil: request.cooldownUntil,
      });

      await this.createCreatorVerificationAuditLog({
        adminId: params.adminId,
        userId: user._id,
        action: 'creator_verification_rejected',
        reason: 'reject_creator_verification',
        note: request.decisionReason,
      });
    }

    await request.save();

    return {
      id: normalizeId(request._id),
      status: request.status,
      reviewedAt: request.reviewedAt,
      decisionReason: request.decisionReason,
      cooldownUntil: request.cooldownUntil,
    };
  }

  async revokeCreatorAccess(params: {
    adminId: string;
    requestId: string;
    note?: string;
  }) {
    const request = await this.requestModel.findById(params.requestId);
    if (!request) {
      throw new NotFoundException('Request not found');
    }

    const user = await this.userModel
      .findById(request.userId)
      .select('email roles isCreatorVerified creatorVerificationApprovedAt');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isCreatorVerified) {
      throw new BadRequestException('User is not currently creator verified');
    }

    user.isCreatorVerified = false;
    user.set('creatorVerificationApprovedAt', null);
    user.roles = (user.roles ?? []).filter(
      (role) => role !== 'creator',
    ) as Array<'user' | 'creator' | 'admin'>;

    request.reviewedBy = new Types.ObjectId(params.adminId);
    request.reviewedAt = new Date();
    request.decisionReason =
      (params.note ?? '').trim() || 'Creator access revoked by admin';

    await Promise.all([user.save(), request.save()]);

    await this.createCreatorVerificationAuditLog({
      adminId: params.adminId,
      userId: user._id,
      action: 'creator_verification_revoked',
      reason: 'revoke_creator_verification',
      note: request.decisionReason,
    });

    return {
      id: normalizeId(request._id),
      status: request.status,
      reviewedAt: request.reviewedAt,
      decisionReason: request.decisionReason,
      user: {
        id: normalizeId(user._id),
        isCreatorVerified: Boolean(user.isCreatorVerified),
        creatorVerifiedAt: user.get('creatorVerificationApprovedAt') ?? null,
        roles: user.roles ?? [],
      },
    };
  }

  async assertAdmin(roles: string[] | undefined) {
    if (!roles?.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
  }
}
