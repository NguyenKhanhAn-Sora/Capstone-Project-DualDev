import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from './user.schema';
import { Follow } from './follow.schema';
import { BlocksService } from './blocks.service';
import { Profile } from '../profiles/profile.schema';
import { UserTasteProfile } from '../explore/user-taste.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { OtpService } from '../otp/otp.service';
import { MailService } from '../mail/mail.service';
import { ActivityLogService } from '../activity/activity.service';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '../config/config.service';
import { parseDuration } from '../common/time.util';
import { createHmac } from 'crypto';
import { Session } from '../auth/session.schema';
import { ActivityType } from '../activity/activity.schema';
import { ActivityLog } from '../activity/activity.schema';
import { ModerationAction } from '../moderation/moderation-action.schema';
import { Post } from '../posts/post.schema';
import { Comment } from '../comment/comment.schema';
import { ReportPost } from '../reportpost/reportpost.schema';
import { ReportComment } from '../reportcomment/reportcomment.schema';
import { ReportUser } from '../reportuser/reportuser.schema';

type NotificationCategoryKey = 'follow' | 'comment' | 'like' | 'mentions';

type NotificationCategorySettings = {
  enabled: boolean;
  mutedUntil: string | null;
  mutedIndefinitely: boolean;
};

type NotificationSettingsResponse = {
  enabled: boolean;
  mutedUntil: string | null;
  mutedIndefinitely: boolean;
  categories: Record<NotificationCategoryKey, NotificationCategorySettings>;
};

const NOTIFICATION_CATEGORY_KEYS: NotificationCategoryKey[] = [
  'follow',
  'comment',
  'like',
  'mentions',
];

const STRIKE_THRESHOLD_REACH_RESTRICT = 10;
const STRIKE_THRESHOLD_ACCOUNT_LIMIT = 20;
const STRIKE_THRESHOLD_SUSPEND = 30;
const REACH_RESTRICT_DAYS = 7;
const ACCOUNT_LIMIT_DAYS = 14;
const SUSPEND_DAYS = 30;
const STRIKE_DECAY_INTERVAL_DAYS = 7;
const STRIKE_DECAY_MONTHLY_CAP = 3;
const STRIKE_DECAY_GOOD_BEHAVIOR_WINDOW_DAYS = 14;
const STRIKE_DECAY_GOOD_BEHAVIOR_MIN_POSTS = 3;
const STRIKE_DECAY_GOOD_BEHAVIOR_MIN_POSITIVE_ACTIONS = 20;

@Injectable()
export class UsersService {
  private readonly passwordChangeWindowMs: number;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Session.name)
    private readonly sessionModel: Model<Session>,
    @InjectModel(Follow.name) private readonly followModel: Model<Follow>,
    @InjectModel(Profile.name) private readonly profileModel: Model<Profile>,
    @InjectModel(ModerationAction.name)
    private readonly moderationActionModel: Model<ModerationAction>,
    @InjectModel(ActivityLog.name)
    private readonly activityLogModel: Model<ActivityLog>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(Comment.name) private readonly commentModel: Model<Comment>,
    @InjectModel(ReportPost.name)
    private readonly reportPostModel: Model<ReportPost>,
    @InjectModel(ReportComment.name)
    private readonly reportCommentModel: Model<ReportComment>,
    @InjectModel(ReportUser.name)
    private readonly reportUserModel: Model<ReportUser>,
    @InjectModel(UserTasteProfile.name)
    private readonly tasteProfileModel: Model<UserTasteProfile>,
    private readonly blocksService: BlocksService,
    private readonly notificationsService: NotificationsService,
    private readonly otpService: OtpService,
    private readonly mailService: MailService,
    private readonly activityLogService: ActivityLogService,
    private readonly config: ConfigService,
  ) {
    this.passwordChangeWindowMs = this.initPasswordChangeWindow();
  }

  private readonly passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  private readonly passkeyRegex = /^\d{6}$/;
  private readonly deviceLimit = 10;
  private readonly twoFactorTrustMs = 7 * 24 * 60 * 60 * 1000;
  private readonly passkeyTrustMs = 3 * 24 * 60 * 60 * 1000;

  private isPasswordStrong(value: string): boolean {
    return this.passwordRegex.test(value);
  }

  private isPasskeyValid(value: string): boolean {
    return this.passkeyRegex.test(value);
  }

  private hashDeviceId(deviceId: string): string {
    return createHmac('sha256', this.config.jwtSecret)
      .update(deviceId)
      .digest('hex');
  }

  private parseUserAgent(ua: string): {
    deviceType: string;
    os: string;
    browser: string;
  } {
    const source = ua ?? '';
    const lower = source.toLowerCase();
    let deviceType = 'desktop';
    if (lower.includes('tablet') || lower.includes('ipad'))
      deviceType = 'tablet';
    if (lower.includes('mobile')) deviceType = 'mobile';

    let os = 'unknown';
    if (lower.includes('windows')) os = 'Windows';
    else if (lower.includes('mac os') || lower.includes('macintosh'))
      os = 'macOS';
    else if (lower.includes('android')) os = 'Android';
    else if (
      lower.includes('iphone') ||
      lower.includes('ipad') ||
      lower.includes('ios')
    )
      os = 'iOS';
    else if (lower.includes('linux')) os = 'Linux';

    let browser = 'unknown';
    if (lower.includes('edg/')) browser = 'Edge';
    else if (lower.includes('chrome/')) browser = 'Chrome';
    else if (lower.includes('firefox/')) browser = 'Firefox';
    else if (lower.includes('safari/') && !lower.includes('chrome/'))
      browser = 'Safari';

    return { deviceType, os, browser };
  }

  async recordLoginDevice(params: {
    userId: string;
    deviceId?: string;
    userAgent?: string;
    deviceInfo?: string;
    ip?: string;
    location?: string;
    loginMethod?: string;
  }): Promise<void> {
    const user = await this.userModel
      .findById(params.userId)
      .select('loginDevices')
      .exec();
    if (!user) return;

    const userAgent = params.userAgent ?? '';
    const { deviceType, os, browser } = this.parseUserAgent(userAgent);
    const baseId = params.deviceId?.trim()
      ? params.deviceId.trim()
      : `${userAgent}::${params.ip ?? ''}`;
    const deviceIdHash = this.hashDeviceId(baseId);
    const now = new Date();
    const current = user.loginDevices ?? [];
    const idx = current.findIndex((d) => d.deviceIdHash === deviceIdHash);
    const nextItem = {
      deviceIdHash,
      userAgent,
      deviceInfo: params.deviceInfo ?? '',
      ip: params.ip ?? '',
      location: params.location ?? '',
      deviceType,
      os,
      browser,
      loginMethod: params.loginMethod ?? '',
      firstSeenAt: idx >= 0 ? (current[idx].firstSeenAt ?? now) : now,
      lastSeenAt: now,
    };

    const next = [...current];
    if (idx >= 0) {
      next[idx] = { ...next[idx], ...nextItem } as any;
    } else {
      next.unshift(nextItem as any);
    }

    user.loginDevices = next.slice(0, this.deviceLimit);
    await user.save();
  }

  private isPasswordChangeFresh(requestedAt?: Date | null): boolean {
    if (!requestedAt) return true;
    const now = Date.now();
    return now - new Date(requestedAt).getTime() <= this.passwordChangeWindowMs;
  }

  private initPasswordChangeWindow() {
    return parseDuration(this.config.otpExpiresIn);
  }

  async listFollowers(params: {
    viewerId: string;
    userId: string;
    limit?: number;
    cursor?: string;
  }): Promise<{
    items: Array<{
      userId: string;
      username: string;
      displayName: string;
      avatarUrl: string;
      isCreatorVerified: boolean;
      isFollowing: boolean;
    }>;
    nextCursor: string | null;
  }> {
    const viewerId = this.asObjectId(params.viewerId, 'viewerId');
    const ownerId = this.asObjectId(params.userId, 'userId');

    const blocked = await this.blocksService.isBlockedEither(viewerId, ownerId);
    if (blocked) {
      throw new ForbiddenException('Action forbidden due to block');
    }

    const ownerProfile = await this.profileModel
      .findOne({ userId: ownerId })
      .select('visibility userId')
      .lean()
      .exec();

    if (!ownerProfile) {
      throw new NotFoundException('Profile not found');
    }

    const isOwner = viewerId.equals(ownerId);
    const viewerFollow = isOwner
      ? true
      : await this.followModel.exists({
          followerId: viewerId,
          followeeId: ownerId,
        });

    const followersVisibility = ownerProfile.visibility?.followers ?? 'public';
    const canViewFollowers =
      isOwner ||
      followersVisibility === 'public' ||
      (followersVisibility === 'followers' && Boolean(viewerFollow));

    if (!canViewFollowers) {
      throw new ForbiddenException('Followers list is private');
    }

    const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 50);
    const cursor = params.cursor
      ? this.asObjectId(params.cursor, 'cursor')
      : null;

    const { blockedIds, blockedByIds } =
      await this.blocksService.getBlockLists(viewerId);
    const excluded = [...blockedIds, ...blockedByIds]
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const follows = await this.followModel
      .find({
        followeeId: ownerId,
        ...(cursor ? { _id: { $lt: cursor } } : {}),
        ...(excluded.length ? { followerId: { $nin: excluded } } : {}),
      })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .select('_id followerId')
      .lean()
      .exec();

    const slice = follows.slice(0, limit);
    const nextCursor =
      follows.length > limit ? follows[limit]._id.toString() : null;

    const userIds = slice
      .map((doc) => doc.followerId?.toString?.())
      .filter(Boolean);

    if (!userIds.length) {
      return { items: [], nextCursor };
    }

    const [profiles, viewerFollowing, users] = await Promise.all([
      this.profileModel
        .find({ userId: { $in: userIds.map((id) => new Types.ObjectId(id)) } })
        .select('userId username displayName avatarUrl')
        .lean()
        .exec(),
      this.followModel
        .find({
          followerId: viewerId,
          followeeId: { $in: userIds.map((id) => new Types.ObjectId(id)) },
        })
        .select('followeeId')
        .lean()
        .exec(),
      this.userModel
        .find({ _id: { $in: userIds.map((id) => new Types.ObjectId(id)) } })
        .select('_id isCreatorVerified')
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

    const creatorVerifiedMap = new Map<string, boolean>();
    users.forEach((u: any) => {
      const id = u._id?.toString?.();
      if (!id) return;
      creatorVerifiedMap.set(id, Boolean(u.isCreatorVerified));
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
          isCreatorVerified: creatorVerifiedMap.get(id) ?? false,
          isFollowing: followingSet.has(id),
        };
      })
      .filter(Boolean) as Array<{
      userId: string;
      username: string;
      displayName: string;
      avatarUrl: string;
      isCreatorVerified: boolean;
      isFollowing: boolean;
    }>;

    return { items, nextCursor };
  }

  async listFollowing(params: {
    viewerId: string;
    userId: string;
    limit?: number;
    cursor?: string;
  }): Promise<{
    items: Array<{
      userId: string;
      username: string;
      displayName: string;
      avatarUrl: string;
      isCreatorVerified: boolean;
      isFollowing: boolean;
    }>;
    nextCursor: string | null;
  }> {
    const viewerId = this.asObjectId(params.viewerId, 'viewerId');
    const ownerId = this.asObjectId(params.userId, 'userId');

    const blocked = await this.blocksService.isBlockedEither(viewerId, ownerId);
    if (blocked) {
      throw new ForbiddenException('Action forbidden due to block');
    }

    const ownerProfile = await this.profileModel
      .findOne({ userId: ownerId })
      .select('visibility userId')
      .lean()
      .exec();

    if (!ownerProfile) {
      throw new NotFoundException('Profile not found');
    }

    const isOwner = viewerId.equals(ownerId);
    const viewerFollow = isOwner
      ? true
      : await this.followModel.exists({
          followerId: viewerId,
          followeeId: ownerId,
        });

    const followingVisibility = ownerProfile.visibility?.following ?? 'public';
    const canViewFollowing =
      isOwner ||
      followingVisibility === 'public' ||
      (followingVisibility === 'followers' && Boolean(viewerFollow));

    if (!canViewFollowing) {
      throw new ForbiddenException('Following list is private');
    }

    const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 50);
    const cursor = params.cursor
      ? this.asObjectId(params.cursor, 'cursor')
      : null;

    const { blockedIds, blockedByIds } =
      await this.blocksService.getBlockLists(viewerId);
    const excluded = [...blockedIds, ...blockedByIds]
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const follows = await this.followModel
      .find({
        followerId: ownerId,
        ...(cursor ? { _id: { $lt: cursor } } : {}),
        ...(excluded.length ? { followeeId: { $nin: excluded } } : {}),
      })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .select('_id followeeId')
      .lean()
      .exec();

    const slice = follows.slice(0, limit);
    const nextCursor =
      follows.length > limit ? follows[limit]._id.toString() : null;

    const userIds = slice
      .map((doc) => doc.followeeId?.toString?.())
      .filter(Boolean);

    if (!userIds.length) {
      return { items: [], nextCursor };
    }

    const [profiles, viewerFollowing, users] = await Promise.all([
      this.profileModel
        .find({ userId: { $in: userIds.map((id) => new Types.ObjectId(id)) } })
        .select('userId username displayName avatarUrl')
        .lean()
        .exec(),
      this.followModel
        .find({
          followerId: viewerId,
          followeeId: { $in: userIds.map((id) => new Types.ObjectId(id)) },
        })
        .select('followeeId')
        .lean()
        .exec(),
      this.userModel
        .find({ _id: { $in: userIds.map((id) => new Types.ObjectId(id)) } })
        .select('_id isCreatorVerified')
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

    const creatorVerifiedMap = new Map<string, boolean>();
    users.forEach((u: any) => {
      const id = u._id?.toString?.();
      if (!id) return;
      creatorVerifiedMap.set(id, Boolean(u.isCreatorVerified));
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
          isCreatorVerified: creatorVerifiedMap.get(id) ?? false,
          isFollowing: followingSet.has(id),
        };
      })
      .filter(Boolean) as Array<{
      userId: string;
      username: string;
      displayName: string;
      avatarUrl: string;
      isCreatorVerified: boolean;
      isFollowing: boolean;
    }>;

    return { items, nextCursor };
  }

  async suggestPeople(params: { viewerId: string; limit?: number }): Promise<{
    items: Array<{
      userId: string;
      username: string;
      displayName: string;
      avatarUrl: string;
      reason: string;
      mutualCount?: number;
      isFollowing: boolean;
    }>;
  }> {
    const viewerId = this.asObjectId(params.viewerId, 'viewerId');
    const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 20);

    const buildFallbackItems = async (
      excludeIds: Set<string>,
      take: number,
    ): Promise<
      Array<{
        userId: string;
        username: string;
        displayName: string;
        avatarUrl: string;
        reason: string;
        mutualCount?: number;
        isFollowing: boolean;
      }>
    > => {
      if (take <= 0) return [];

      const excludedObjectIds = Array.from(excludeIds)
        .filter(Types.ObjectId.isValid)
        .map((id) => new Types.ObjectId(id));

      const fetchSize = Math.min(Math.max(take * 12, take), 300);

      const fallbackUsers = await this.userModel
        .find({ _id: { $nin: excludedObjectIds }, status: { $ne: 'banned' } })
        .sort({ followerCount: -1, _id: -1 })
        .limit(fetchSize)
        .select('_id')
        .lean()
        .exec();

      const ids = fallbackUsers
        .map((u: any) => u._id?.toString?.())
        .filter(Boolean) as string[];
      if (!ids.length) return [];

      const profiles = await this.profileModel
        .find({ userId: { $in: ids.map((id) => new Types.ObjectId(id)) } })
        .select('userId username displayName avatarUrl')
        .lean()
        .exec();
      const profileByUserId = new Map<string, any>();
      profiles.forEach((p: any) => {
        const id = p.userId?.toString?.();
        if (id) profileByUserId.set(id, p);
      });

      const items: Array<{
        userId: string;
        username: string;
        displayName: string;
        avatarUrl: string;
        reason: string;
        mutualCount?: number;
        isFollowing: boolean;
      }> = [];

      for (const id of ids) {
        if (items.length >= take) break;
        const p = profileByUserId.get(id);
        if (!p) continue;
        items.push({
          userId: id,
          username: p.username ?? '',
          displayName: p.displayName ?? p.username ?? '',
          avatarUrl: p.avatarUrl ?? '',
          reason: 'Suggested for you',
          mutualCount: 0,
          isFollowing: false,
        });
      }

      return items;
    };

    const { blockedIds, blockedByIds } =
      await this.blocksService.getBlockLists(viewerId);

    const [viewerFollowingDocs, viewerProfile, taste] = await Promise.all([
      this.followModel
        .find({ followerId: viewerId })
        .select('followeeId')
        .lean()
        .exec(),
      this.profileModel
        .findOne({ userId: viewerId })
        .select('workplace')
        .lean()
        .exec(),
      this.tasteProfileModel
        .findOne({ userId: viewerId })
        .select('authorWeights')
        .lean()
        .exec(),
    ]);

    const alreadyFollowing = new Set<string>();
    viewerFollowingDocs.forEach((doc: any) => {
      const id = doc.followeeId?.toString?.();
      if (id) alreadyFollowing.add(id);
    });

    const excluded = new Set<string>();
    excluded.add(viewerId.toString());
    alreadyFollowing.forEach((id) => excluded.add(id));
    blockedIds.forEach((id) => excluded.add(id));
    blockedByIds.forEach((id) => excluded.add(id));

    const followingIds = Array.from(alreadyFollowing)
      .filter((id) => Types.ObjectId.isValid(id))
      .slice(0, 2000)
      .map((id) => new Types.ObjectId(id));

    const mutualCandidates: Array<{ userId: string; mutualCount: number }> =
      followingIds.length
        ? (
            (await this.followModel
              .aggregate([
                {
                  $match: {
                    followerId: { $in: followingIds },
                  },
                },
                {
                  $group: {
                    _id: '$followeeId',
                    mutualCount: { $sum: 1 },
                  },
                },
                { $sort: { mutualCount: -1, _id: -1 } },
                { $limit: 200 },
              ])
              .exec()) as Array<{ _id: Types.ObjectId; mutualCount: number }>
          ).map((row) => ({
            userId: row._id?.toString?.() ?? '',
            mutualCount: Number(row.mutualCount ?? 0),
          }))
        : [];

    const mutualMap = new Map<string, number>();
    mutualCandidates.forEach((c) => {
      if (c.userId) mutualMap.set(c.userId, c.mutualCount);
    });

    const tasteAuthorWeights: Array<{ userId: string; w: number }> = [];
    const authorWeights = (taste as any)?.authorWeights as
      | Map<string, number>
      | Record<string, number>
      | undefined;
    if (authorWeights) {
      const entries =
        authorWeights instanceof Map
          ? Array.from(authorWeights.entries())
          : Object.entries(authorWeights);
      entries
        .filter(([k, v]) => Types.ObjectId.isValid(k) && Number(v) > 0)
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, 60)
        .forEach(([k, v]) =>
          tasteAuthorWeights.push({ userId: k, w: Number(v) }),
        );
    }

    const sameCompanyIds: string[] = [];
    const companyId = (viewerProfile as any)?.workplace?.companyId;
    if (companyId) {
      const companyProfiles = await this.profileModel
        .find({ 'workplace.companyId': companyId })
        .select('userId')
        .limit(200)
        .lean()
        .exec();
      companyProfiles.forEach((p: any) => {
        const id = p.userId?.toString?.();
        if (id) sameCompanyIds.push(id);
      });
    }

    const candidateSet = new Set<string>();
    for (const c of mutualCandidates) {
      if (!c.userId) continue;
      if (excluded.has(c.userId)) continue;
      if (c.mutualCount <= 0) continue;
      candidateSet.add(c.userId);
      if (candidateSet.size >= 250) break;
    }
    for (const c of sameCompanyIds) {
      if (excluded.has(c)) continue;
      candidateSet.add(c);
      if (candidateSet.size >= 250) break;
    }
    for (const c of tasteAuthorWeights) {
      if (excluded.has(c.userId)) continue;
      candidateSet.add(c.userId);
      if (candidateSet.size >= 250) break;
    }

    const candidateIds = Array.from(candidateSet)
      .filter((id) => Types.ObjectId.isValid(id))
      .slice(0, 250)
      .map((id) => new Types.ObjectId(id));

    if (!candidateIds.length) {
      const excludedFallback = new Set<string>(excluded);
      const items = await buildFallbackItems(excludedFallback, limit);
      return { items };
    }

    const [profiles, users] = await Promise.all([
      this.profileModel
        .find({ userId: { $in: candidateIds } })
        .select('userId username displayName avatarUrl workplace')
        .lean()
        .exec(),
      this.userModel
        .find({ _id: { $in: candidateIds } })
        .select('_id followerCount status')
        .lean()
        .exec(),
    ]);

    const profileByUserId = new Map<string, any>();
    profiles.forEach((p: any) => {
      const id = p.userId?.toString?.();
      if (id) profileByUserId.set(id, p);
    });
    const followerCountByUserId = new Map<string, number>();
    users.forEach((u: any) => {
      const id = u._id?.toString?.();
      if (id) followerCountByUserId.set(id, Number(u.followerCount ?? 0));
    });
    const activeCandidateIds = new Set(
      users
        .filter((u: any) => u?.status !== 'banned')
        .map((u: any) => u._id?.toString?.())
        .filter((id: unknown): id is string => Boolean(id)),
    );

    const sameCompanySet = new Set(sameCompanyIds);
    const tasteWeightMap = new Map<string, number>();
    tasteAuthorWeights.forEach((t) => tasteWeightMap.set(t.userId, t.w));

    const scored = Array.from(candidateSet)
      .filter((id) => !excluded.has(id) && activeCandidateIds.has(id))
      .map((id) => {
        const mutual = mutualMap.get(id) ?? 0;
        const sameCompany = sameCompanySet.has(id) ? 1 : 0;
        const tasteW = tasteWeightMap.get(id) ?? 0;
        const popularity = followerCountByUserId.get(id) ?? 0;
        const score =
          mutual * 10 +
          sameCompany * 6 +
          tasteW * 2 +
          Math.log10(1 + popularity);

        let reason = 'Suggested for you';
        if (mutual >= 3) reason = `${mutual} mutual connections`;
        else if (mutual >= 1) reason = `${mutual} mutual connection`;
        else if (sameCompany) reason = 'Same workplace';
        else if (tasteW > 0) reason = 'Based on your interests';

        return {
          userId: id,
          score,
          mutualCount: mutual,
          reason,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit * 3);

    const picked: string[] = [];
    for (const s of scored) {
      if (picked.length >= limit) break;
      if (!profileByUserId.has(s.userId)) continue;
      picked.push(s.userId);
    }

    const scoreByUserId = new Map<string, any>();
    scored.forEach((s) => scoreByUserId.set(s.userId, s));

    let items = picked
      .map((id) => {
        const p = profileByUserId.get(id);
        const s = scoreByUserId.get(id);
        if (!p) return null;
        return {
          userId: id,
          username: p.username ?? '',
          displayName: p.displayName ?? p.username ?? '',
          avatarUrl: p.avatarUrl ?? '',
          reason: s?.reason ?? 'Suggested for you',
          mutualCount: s?.mutualCount ?? 0,
          isFollowing: false,
        };
      })
      .filter(Boolean) as Array<{
      userId: string;
      username: string;
      displayName: string;
      avatarUrl: string;
      reason: string;
      mutualCount?: number;
      isFollowing: boolean;
    }>;

    if (items.length < limit) {
      const excludeMore = new Set<string>(excluded);
      picked.forEach((id) => excludeMore.add(id));
      const extra = await buildFallbackItems(excludeMore, limit - items.length);
      items = [...items, ...extra];
    }

    return { items };
  }

  private sanitizeRecentAccounts(list: User['recentAccounts'] = []) {
    return (list ?? [])
      .filter((item) => item?.email)
      .map((item) => ({
        email: item.email.toLowerCase(),
        displayName: item.displayName ?? undefined,
        username: item.username ?? undefined,
        avatarUrl: item.avatarUrl ?? undefined,
        lastUsed: item.lastUsed ?? undefined,
      }))
      .sort((a, b) => {
        const aTime = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
        const bTime = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 5);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email }).exec();
  }

  findById(userId: string): Promise<User | null> {
    return this.userModel.findById(userId).exec();
  }

  async releaseAccountLimitIfExpired(userId: string): Promise<User | null> {
    const user = await this.findById(userId);
    if (!user) return null;

    const accountLimitedUntil =
      user.accountLimitedUntil instanceof Date
        ? user.accountLimitedUntil
        : null;
    const isExpired =
      accountLimitedUntil != null &&
      accountLimitedUntil.getTime() <= Date.now();
    const canAutoRelease =
      user.status === 'pending' &&
      user.signupStage === 'completed' &&
      !user.accountLimitedIndefinitely;

    const suspendedUntil =
      user.suspendedUntil instanceof Date ? user.suspendedUntil : null;
    const isSuspendExpired =
      suspendedUntil != null && suspendedUntil.getTime() <= Date.now();
    const canAutoUnsuspend =
      user.status === 'banned' && !user.suspendedIndefinitely;

    const shouldReleaseLimit = canAutoRelease && isExpired;
    const shouldUnsuspend = canAutoUnsuspend && isSuspendExpired;

    if (!shouldReleaseLimit && !shouldUnsuspend) {
      return user;
    }

    const update: Record<string, unknown> = {};

    if (shouldReleaseLimit) {
      update.accountLimitedUntil = null;
      update.accountLimitedIndefinitely = false;
      update.status = 'active';
    }

    if (shouldUnsuspend) {
      update.suspendedUntil = null;
      update.suspendedIndefinitely = false;
      update.status = 'active';
    }

    await this.userModel
      .updateOne(
        { _id: user._id },
        {
          $set: update,
        },
      )
      .exec();

    return this.findById(userId);
  }

  async applyAutoStrikePenaltyOnThresholdCross(params: {
    userId: string | Types.ObjectId;
    previousStrike: number;
    nextStrike: number;
  }): Promise<void> {
    const previousStrike = Math.max(0, Number(params.previousStrike) || 0);
    const nextStrike = Math.max(0, Number(params.nextStrike) || 0);
    if (nextStrike <= previousStrike) return;

    const crossedSuspend =
      previousStrike < STRIKE_THRESHOLD_SUSPEND &&
      nextStrike >= STRIKE_THRESHOLD_SUSPEND;
    const crossedLimit =
      previousStrike < STRIKE_THRESHOLD_ACCOUNT_LIMIT &&
      nextStrike >= STRIKE_THRESHOLD_ACCOUNT_LIMIT;
    const crossedReachRestrict =
      previousStrike < STRIKE_THRESHOLD_REACH_RESTRICT &&
      nextStrike >= STRIKE_THRESHOLD_REACH_RESTRICT;

    if (!crossedSuspend && !crossedLimit && !crossedReachRestrict) {
      return;
    }

    const userObjectId =
      params.userId instanceof Types.ObjectId
        ? params.userId
        : this.asObjectId(String(params.userId), 'userId');

    const user = await this.userModel
      .findById(userObjectId)
      .select(
        '_id email status signupStage accountLimitedUntil accountLimitedIndefinitely reachRestrictedUntil suspendedUntil suspendedIndefinitely',
      )
      .lean();

    if (!user?._id) return;

    const now = new Date();
    const nowMs = now.getTime();

    const addDays = (days: number) =>
      new Date(nowMs + days * 24 * 60 * 60 * 1000);
    const maxDate = (a: Date | null, b: Date) => {
      if (!a) return b;
      return a.getTime() >= b.getTime() ? a : b;
    };

    const activeSuspended =
      Boolean(user.suspendedIndefinitely) ||
      Boolean(
        user.suspendedUntil && new Date(user.suspendedUntil).getTime() > nowMs,
      ) ||
      user.status === 'banned';

    if (crossedSuspend) {
      if (user.suspendedIndefinitely) {
        return;
      }

      const targetSuspendedUntil = addDays(SUSPEND_DAYS);
      const currentSuspendedUntil =
        user.suspendedUntil && new Date(user.suspendedUntil).getTime() > nowMs
          ? new Date(user.suspendedUntil)
          : null;
      const nextSuspendedUntil = maxDate(
        currentSuspendedUntil,
        targetSuspendedUntil,
      );

      await this.userModel
        .updateOne(
          { _id: userObjectId },
          {
            $set: {
              status: 'banned',
              suspendedUntil: nextSuspendedUntil,
              suspendedIndefinitely: false,
              accountLimitedUntil: null,
              accountLimitedIndefinitely: false,
            },
          },
        )
        .exec();

      await this.logoutAllDevices({ userId: userObjectId.toString() });
      this.notificationsService.emitForceLogout(
        userObjectId.toString(),
        'suspended',
      );

      const noticeBody = `Your strike total reached ${nextStrike}, so your account has been suspended until ${nextSuspendedUntil.toISOString()}.`;
      await this.notificationsService
        .createSystemNoticeNotification({
          recipientId: userObjectId.toString(),
          title: 'Strike threshold penalty applied',
          body: noticeBody,
          level: 'warning',
          actionUrl: '/settings?section=violations',
        })
        .catch(() => undefined);

      if (user.email?.trim()) {
        await this.mailService
          .sendStrikeThresholdPenaltyEmail({
            email: user.email.trim(),
            penaltyType: 'account_suspended',
            strikeTotal: nextStrike,
            threshold: STRIKE_THRESHOLD_SUSPEND,
            expiresAt: nextSuspendedUntil,
          })
          .catch(() => undefined);
      }
      return;
    }

    if (crossedLimit) {
      if (activeSuspended || user.accountLimitedIndefinitely) {
        return;
      }

      const targetLimitedUntil = addDays(ACCOUNT_LIMIT_DAYS);
      const currentLimitedUntil =
        user.accountLimitedUntil &&
        new Date(user.accountLimitedUntil).getTime() > nowMs
          ? new Date(user.accountLimitedUntil)
          : null;
      const nextLimitedUntil = maxDate(currentLimitedUntil, targetLimitedUntil);

      await this.userModel
        .updateOne(
          { _id: userObjectId },
          {
            $set: {
              status: 'pending',
              signupStage: 'completed',
              accountLimitedUntil: nextLimitedUntil,
              accountLimitedIndefinitely: false,
            },
          },
        )
        .exec();

      const noticeBody = `Your strike total reached ${nextStrike}, so your account is now read-only until ${nextLimitedUntil.toISOString()}.`;
      await this.notificationsService
        .createSystemNoticeNotification({
          recipientId: userObjectId.toString(),
          title: 'Strike threshold penalty applied',
          body: noticeBody,
          level: 'warning',
          actionUrl: '/settings?section=violations',
        })
        .catch(() => undefined);

      if (user.email?.trim()) {
        await this.mailService
          .sendStrikeThresholdPenaltyEmail({
            email: user.email.trim(),
            penaltyType: 'read_only_limited',
            strikeTotal: nextStrike,
            threshold: STRIKE_THRESHOLD_ACCOUNT_LIMIT,
            expiresAt: nextLimitedUntil,
          })
          .catch(() => undefined);
      }
      return;
    }

    if (!crossedReachRestrict) {
      return;
    }

    const targetReachRestrictedUntil = addDays(REACH_RESTRICT_DAYS);
    const currentReachRestrictedUntil =
      user.reachRestrictedUntil &&
      new Date(user.reachRestrictedUntil).getTime() > nowMs
        ? new Date(user.reachRestrictedUntil)
        : null;
    const nextReachRestrictedUntil = maxDate(
      currentReachRestrictedUntil,
      targetReachRestrictedUntil,
    );

    await this.userModel
      .updateOne(
        { _id: userObjectId },
        {
          $set: {
            reachRestrictedUntil: nextReachRestrictedUntil,
          },
        },
      )
      .exec();

    const noticeBody = `Your strike total reached ${nextStrike}, so distribution of your posts is restricted until ${nextReachRestrictedUntil.toISOString()}.`;
    await this.notificationsService
      .createSystemNoticeNotification({
        recipientId: userObjectId.toString(),
        title: 'Strike threshold penalty applied',
        body: noticeBody,
        level: 'warning',
        actionUrl: '/settings?section=violations',
      })
      .catch(() => undefined);

    if (user.email?.trim()) {
      await this.mailService
        .sendStrikeThresholdPenaltyEmail({
          email: user.email.trim(),
          penaltyType: 'reach_restricted',
          strikeTotal: nextStrike,
          threshold: STRIKE_THRESHOLD_REACH_RESTRICT,
          expiresAt: nextReachRestrictedUntil,
        })
        .catch(() => undefined);
    }
  }

  async runStrikeDecaySweep(): Promise<{
    checkedUsers: number;
    decayedUsers: number;
  }> {
    const now = new Date();
    const nowMs = now.getTime();
    const decayWindowStart = new Date(
      nowMs - STRIKE_DECAY_INTERVAL_DAYS * 24 * 60 * 60 * 1000,
    );
    const monthStartUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    );

    const candidates = await this.userModel
      .find({ strikeCount: { $gt: 0 } })
      .select(
        '_id email strikeCount status signupStage interactionMutedUntil interactionMutedIndefinitely accountLimitedUntil accountLimitedIndefinitely reachRestrictedUntil suspendedUntil suspendedIndefinitely createdAt',
      )
      .lean();

    if (!candidates.length) {
      return { checkedUsers: 0, decayedUsers: 0 };
    }

    const admin = await this.userModel
      .findOne({ roles: 'admin', status: 'active' })
      .select('_id')
      .lean()
      .exec();

    let decayedUsers = 0;

    for (const user of candidates) {
      const strikeCount = Number(user.strikeCount ?? 0);
      if (strikeCount <= 0) continue;

      const isSuspendedActive =
        user.status === 'banned' ||
        Boolean(user.suspendedIndefinitely) ||
        Boolean(
          user.suspendedUntil &&
          new Date(user.suspendedUntil).getTime() > nowMs,
        );
      const isLimitedActive =
        (user.status === 'pending' && user.signupStage === 'completed') ||
        Boolean(user.accountLimitedIndefinitely) ||
        Boolean(
          user.accountLimitedUntil &&
          new Date(user.accountLimitedUntil).getTime() > nowMs,
        );
      const isInteractionMutedActive =
        Boolean(user.interactionMutedIndefinitely) ||
        Boolean(
          user.interactionMutedUntil &&
          new Date(user.interactionMutedUntil).getTime() > nowMs,
        );
      const isReachRestrictedActive = Boolean(
        user.reachRestrictedUntil &&
        new Date(user.reachRestrictedUntil).getTime() > nowMs,
      );

      if (
        isSuspendedActive ||
        isLimitedActive ||
        isInteractionMutedActive ||
        isReachRestrictedActive
      ) {
        continue;
      }

      const userObjectId = new Types.ObjectId(user._id);

      const [lastViolation, lastDecay, decayCountThisMonth] = await Promise.all(
        [
          this.moderationActionModel
            .findOne({
              targetType: 'user',
              targetId: userObjectId,
              invalidatedAt: null,
              action: {
                $in: [
                  'remove_post',
                  'restrict_post',
                  'delete_comment',
                  'suspend_user',
                  'limit_account',
                  'violation',
                ],
              },
            })
            .sort({ createdAt: -1 })
            .select('createdAt')
            .lean()
            .exec(),
          this.moderationActionModel
            .findOne({
              targetType: 'user',
              targetId: userObjectId,
              invalidatedAt: null,
              action: 'strike_decay_auto',
            })
            .sort({ createdAt: -1 })
            .select('createdAt')
            .lean()
            .exec(),
          this.moderationActionModel.countDocuments({
            targetType: 'user',
            targetId: userObjectId,
            invalidatedAt: null,
            action: 'strike_decay_auto',
            createdAt: { $gte: monthStartUtc },
          }),
        ],
      );

      if (decayCountThisMonth >= STRIKE_DECAY_MONTHLY_CAP) {
        continue;
      }

      const remainingMonthlyDecayBudget = Math.max(
        0,
        STRIKE_DECAY_MONTHLY_CAP - decayCountThisMonth,
      );
      if (remainingMonthlyDecayBudget <= 0) {
        continue;
      }

      const latestBlockingAt =
        lastViolation?.createdAt ??
        lastDecay?.createdAt ??
        user.createdAt ??
        now;
      const latestBlockingDate = new Date(latestBlockingAt);
      if (
        Number.isNaN(latestBlockingDate.getTime()) ||
        latestBlockingDate.getTime() > decayWindowStart.getTime()
      ) {
        continue;
      }

      const baseDecay = 1;
      const bonusDecayEligible =
        remainingMonthlyDecayBudget > 1 &&
        (await this.qualifiesForStrikeDecayGoodBehaviorBonus({
          userObjectId,
          now,
        }));
      const requestedDecay = baseDecay + (bonusDecayEligible ? 1 : 0);
      const decayAmount = Math.min(
        strikeCount,
        remainingMonthlyDecayBudget,
        requestedDecay,
      );

      const nextStrike = Math.max(0, strikeCount - decayAmount);
      if (nextStrike === strikeCount || decayAmount <= 0) continue;

      await this.userModel
        .updateOne({ _id: userObjectId }, { $set: { strikeCount: nextStrike } })
        .exec();

      const moderatorId = admin?._id
        ? new Types.ObjectId(admin._id)
        : userObjectId;
      for (let i = 0; i < decayAmount; i += 1) {
        const decayKind = i === 0 ? 'base' : 'bonus';
        const reasonText =
          decayKind === 'base'
            ? 'Automatic strike decay after clean behavior window'
            : 'Automatic bonus strike decay after sustained positive behavior';

        await this.moderationActionModel
          .create({
            targetType: 'user',
            targetId: userObjectId,
            action: 'strike_decay_auto',
            category: 'automatic_rehabilitation',
            reason: reasonText,
            severity: null,
            note: `Auto decay (${decayKind}): strike ${strikeCount} -> ${nextStrike}`,
            moderatorId,
          })
          .catch(() => undefined);
      }

      await this.notificationsService
        .createSystemNoticeNotification({
          recipientId: userObjectId.toString(),
          title: 'Your strike score was reduced',
          body: bonusDecayEligible
            ? `Great progress. Your strike score decreased from ${strikeCount} to ${nextStrike} (including bonus reduction for sustained positive behavior).`
            : `You kept a clean behavior streak, so your strike score decreased from ${strikeCount} to ${nextStrike}.`,
          level: 'info',
          actionUrl: '/settings?section=violations',
        })
        .catch(() => undefined);

      if (user.email?.trim()) {
        await this.mailService
          .sendStrikeDecayAppliedEmail({
            email: user.email.trim(),
            previousStrike: strikeCount,
            nextStrike,
            ruleWindowDays: bonusDecayEligible
              ? STRIKE_DECAY_GOOD_BEHAVIOR_WINDOW_DAYS
              : STRIKE_DECAY_INTERVAL_DAYS,
            decayAmount,
            bonusApplied: bonusDecayEligible,
          })
          .catch(() => undefined);
      }

      decayedUsers += 1;
    }

    return {
      checkedUsers: candidates.length,
      decayedUsers,
    };
  }

  private async qualifiesForStrikeDecayGoodBehaviorBonus(params: {
    userObjectId: Types.ObjectId;
    now: Date;
  }): Promise<boolean> {
    const { userObjectId, now } = params;
    const windowStart = new Date(
      now.getTime() -
        STRIKE_DECAY_GOOD_BEHAVIOR_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const [recentPostIds, recentCommentIds, positiveActionsCount] =
      await Promise.all([
        this.postModel
          .find({
            authorId: userObjectId,
            status: 'published',
            deletedAt: null,
            createdAt: { $gte: windowStart },
          })
          .select('_id')
          .lean()
          .exec(),
        this.commentModel
          .find({
            authorId: userObjectId,
            deletedAt: null,
            createdAt: { $gte: windowStart },
          })
          .select('_id')
          .lean()
          .exec(),
        this.activityLogModel.countDocuments({
          userId: userObjectId,
          createdAt: { $gte: windowStart },
          type: {
            $in: [
              'post_like',
              'comment_like',
              'comment',
              'repost',
              'save',
              'follow',
            ],
          },
        }),
      ]);

    if (recentPostIds.length < STRIKE_DECAY_GOOD_BEHAVIOR_MIN_POSTS) {
      return false;
    }

    if (
      positiveActionsCount < STRIKE_DECAY_GOOD_BEHAVIOR_MIN_POSITIVE_ACTIONS
    ) {
      return false;
    }

    const postIdList = recentPostIds.map((item) => item._id).filter(Boolean);
    const commentIdList = recentCommentIds
      .map((item) => item._id)
      .filter(Boolean);

    const [openPostReports, openCommentReports, openUserReports] =
      await Promise.all([
        postIdList.length
          ? this.reportPostModel.countDocuments({
              postId: { $in: postIdList },
              status: 'open',
            })
          : Promise.resolve(0),
        commentIdList.length
          ? this.reportCommentModel.countDocuments({
              commentId: { $in: commentIdList },
              status: 'open',
            })
          : Promise.resolve(0),
        this.reportUserModel.countDocuments({
          targetUserId: userObjectId,
          status: 'open',
        }),
      ]);

    return openPostReports + openCommentReports + openUserReports === 0;
  }

  async createPending(email: string): Promise<User> {
    const existing = await this.findByEmail(email);
    if (existing) {
      return existing;
    }
    return this.userModel.create({
      email,
      status: 'pending',
      isVerified: true,
      signupStage: 'info_pending',
    });
  }

  async ensureAdminUser(params: {
    email: string;
    passwordHash?: string | null;
  }): Promise<User> {
    const email = params.email.toLowerCase();
    const existing = await this.findByEmail(email);

    if (!existing) {
      return this.userModel.create({
        email,
        passwordHash: params.passwordHash ?? null,
        roles: ['admin'],
        status: 'active',
        isVerified: true,
        signupStage: 'completed',
        passwordChangedAt: params.passwordHash ? new Date() : null,
      });
    }

    const roles = Array.from(new Set([...(existing.roles ?? []), 'admin']));
    const update: Record<string, unknown> = {
      roles,
      status: 'active',
      isVerified: true,
      signupStage: 'completed',
    };

    if (params.passwordHash) {
      update.passwordHash = params.passwordHash;
      update.passwordChangedAt = new Date();
    }

    await this.userModel.updateOne({ _id: existing._id }, { $set: update });
    const refreshed = await this.findById(existing._id.toString());
    return refreshed ?? existing;
  }

  async setPassword(userId: string, passwordHash: string): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: userId },
        { passwordHash, passwordChangedAt: new Date() },
      )
      .exec();
  }

  async completeSignup(userId: string): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: userId },
        { signupStage: 'completed', status: 'active', isVerified: true },
      )
      .exec();
  }

  async getSettings(userId: string): Promise<{
    theme: 'light' | 'dark';
    language: 'vi' | 'en' | 'ja' | 'zh';
    dmListFrom: 'everyone' | 'followers_only';
    dmCallFrom: 'everyone' | 'followers_only';
    showCordigramMemberSince: boolean;
    sharePresence: boolean;
    chatSoundEnabled: boolean;
  }> {
    const user = await this.userModel
      .findById(userId)
      .select('settings')
      .lean()
      .exec();
    const s = user?.settings as Record<string, unknown> | undefined;

    return {
      theme: (s?.theme as 'light' | 'dark') ?? 'light',
      language: (s?.language as 'vi' | 'en' | 'ja' | 'zh') ?? 'vi',
      dmListFrom:
        (s?.dmListFrom as 'everyone' | 'followers_only') ?? 'everyone',
      dmCallFrom:
        (s?.dmCallFrom as 'everyone' | 'followers_only') ?? 'everyone',
      showCordigramMemberSince:
        (s?.showCordigramMemberSince as boolean | undefined) !== false,
      sharePresence: (s?.sharePresence as boolean | undefined) !== false,
      chatSoundEnabled:
        (s?.chatSoundEnabled as boolean | undefined) !== false,
    };
  }

  async getNotificationSettings(
    userId: string,
  ): Promise<NotificationSettingsResponse> {
    const user = await this.userModel
      .findById(userId)
      .select('settings.notifications')
      .lean()
      .exec();

    const mutedUntil = user?.settings?.notifications?.mutedUntil ?? null;
    const mutedIndefinitely =
      user?.settings?.notifications?.mutedIndefinitely ?? false;

    const categorySettings = user?.settings?.notifications?.categories ?? {};

    const now = new Date();

    const updates: Record<string, Date | boolean | null> = {};

    const normalizeSettings = (params: {
      mutedUntil: Date | string | null | undefined;
      mutedIndefinitely: boolean | null | undefined;
      updatePrefix?: string;
    }) => {
      const rawMutedUntil = params.mutedUntil
        ? new Date(params.mutedUntil)
        : null;
      let nextMutedUntil = rawMutedUntil;
      let nextMutedIndefinitely = Boolean(params.mutedIndefinitely);

      if (nextMutedUntil && nextMutedUntil.getTime() <= now.getTime()) {
        nextMutedUntil = null;
        nextMutedIndefinitely = false;
        if (params.updatePrefix) {
          updates[`${params.updatePrefix}.mutedUntil`] = null;
          updates[`${params.updatePrefix}.mutedIndefinitely`] = false;
        }
      }

      const enabled =
        !nextMutedIndefinitely &&
        (!nextMutedUntil || nextMutedUntil.getTime() <= now.getTime());

      return {
        enabled,
        mutedUntil: nextMutedUntil ? nextMutedUntil.toISOString() : null,
        mutedIndefinitely: nextMutedIndefinitely,
      };
    };

    const globalState = normalizeSettings({
      mutedUntil,
      mutedIndefinitely,
      updatePrefix: 'settings.notifications',
    });

    const categories = NOTIFICATION_CATEGORY_KEYS.reduce(
      (acc, key) => {
        const entry = categorySettings?.[key] ?? {};
        acc[key] = normalizeSettings({
          mutedUntil: entry?.mutedUntil,
          mutedIndefinitely: entry?.mutedIndefinitely,
          updatePrefix: `settings.notifications.categories.${key}`,
        });
        return acc;
      },
      {} as Record<NotificationCategoryKey, NotificationCategorySettings>,
    );

    if (Object.keys(updates).length) {
      await this.userModel
        .updateOne(
          { _id: userId },
          {
            $set: updates,
          },
        )
        .exec();
    }

    return {
      ...globalState,
      categories,
    };
  }

  async updateNotificationSettings(params: {
    userId: string;
    category?: NotificationCategoryKey;
    enabled?: boolean;
    mutedUntil?: string | null;
    mutedIndefinitely?: boolean;
  }): Promise<NotificationSettingsResponse> {
    const now = new Date();

    let nextMutedUntil: Date | null = null;
    let nextMutedIndefinitely = false;

    if (params.enabled === true) {
      nextMutedUntil = null;
      nextMutedIndefinitely = false;
    } else if (params.mutedIndefinitely) {
      nextMutedUntil = null;
      nextMutedIndefinitely = true;
    } else if (params.mutedUntil) {
      const parsed = new Date(params.mutedUntil);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('Invalid mutedUntil value');
      }
      if (parsed.getTime() <= now.getTime()) {
        nextMutedUntil = null;
        nextMutedIndefinitely = false;
      } else {
        nextMutedUntil = parsed;
        nextMutedIndefinitely = false;
      }
    } else if (params.enabled === false) {
      nextMutedUntil = null;
      nextMutedIndefinitely = true;
    } else {
      return this.getNotificationSettings(params.userId);
    }

    const updatePath = params.category
      ? `settings.notifications.categories.${params.category}`
      : 'settings.notifications';

    await this.userModel
      .updateOne(
        { _id: params.userId },
        {
          $set: {
            [`${updatePath}.mutedUntil`]: nextMutedUntil,
            [`${updatePath}.mutedIndefinitely`]: nextMutedIndefinitely,
          },
        },
      )
      .exec();

    return this.getNotificationSettings(params.userId);
  }

  async listBlockedUsers(userId: string, limit = 50) {
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    const blocks = await this.blocksService.listBlockedUsers(userId, safeLimit);

    if (!blocks.length) {
      return {
        items: [] as Array<{
          userId: string;
          username?: string;
          displayName?: string;
          avatarUrl?: string;
          blockedAt?: Date | null;
        }>,
      };
    }

    const blockedIds = blocks
      .map((item) => item.blockedId)
      .filter((id): id is string => Boolean(id));

    const profiles = await this.profileModel
      .find({ userId: { $in: blockedIds.map((id) => new Types.ObjectId(id)) } })
      .select('userId displayName username avatarUrl')
      .lean();

    const profileMap = new Map(profiles.map((p) => [p.userId.toString(), p]));

    const items = blocks.map((block) => {
      const profile = block.blockedId
        ? profileMap.get(block.blockedId) || null
        : null;
      return {
        userId: block.blockedId,
        username: profile?.username,
        displayName: profile?.displayName,
        avatarUrl: profile?.avatarUrl,
        blockedAt: block.blockedAt ?? null,
      };
    });

    return { items };
  }

  async listActivity(params: {
    userId: string;
    types?: ActivityType[];
    limit?: number;
    cursor?: string | null;
  }) {
    return this.activityLogService.list({
      userId: params.userId,
      types: params.types,
      limit: params.limit,
      cursor: params.cursor ?? null,
    });
  }

  async getPasswordChangeStatus(userId: string): Promise<{
    lastChangedAt: string | null;
  }> {
    const user = await this.userModel
      .findById(userId)
      .select('passwordChangedAt')
      .lean()
      .exec();
    const lastChangedAt = user?.passwordChangedAt
      ? new Date(user.passwordChangedAt).toISOString()
      : null;
    return { lastChangedAt };
  }

  async getPasskeyStatus(
    userId: string,
  ): Promise<{ hasPasskey: boolean; enabled: boolean }> {
    const user = await this.userModel
      .findById(userId)
      .select('passkey passkeyEnabled')
      .lean()
      .exec();
    const hasPasskey = Boolean(user?.passkey);
    const enabled = hasPasskey ? user?.passkeyEnabled !== false : false;
    return { hasPasskey, enabled };
  }

  async getDeviceTrustStatus(params: {
    userId: string;
    deviceId?: string;
  }): Promise<{ trusted: boolean; hasPasskey: boolean; enabled: boolean }> {
    const user = await this.userModel
      .findById(params.userId)
      .select('passkey passkeyEnabled trustedDevices')
      .lean()
      .exec();
    const enabled = user?.passkey ? user?.passkeyEnabled !== false : false;
    const hasPasskey = Boolean(user?.passkey) && enabled;
    if (!params.deviceId) {
      return { trusted: false, hasPasskey, enabled };
    }
    const deviceIdHash = this.hashDeviceId(params.deviceId);
    const now = new Date();
    const trusted = Boolean(
      user?.trustedDevices?.some(
        (d) =>
          d.deviceIdHash === deviceIdHash &&
          (!d.expiresAt || d.expiresAt > now),
      ),
    );
    const expired = user?.trustedDevices?.filter(
      (d) => d.expiresAt && d.expiresAt <= now,
    );
    if (expired?.length) {
      await this.userModel
        .updateOne(
          { _id: params.userId },
          { $pull: { trustedDevices: { expiresAt: { $lte: now } } } },
        )
        .exec();
    }
    return { trusted, hasPasskey, enabled };
  }

  async getLoginDevices(params: {
    userId: string;
    deviceId?: string;
    userAgent?: string;
    ip?: string;
  }): Promise<{
    currentDeviceIdHash?: string;
    devices: Array<{
      deviceIdHash: string;
      userAgent?: string;
      deviceInfo?: string;
      ip?: string;
      location?: string;
      deviceType?: string;
      os?: string;
      browser?: string;
      loginMethod?: string;
      firstSeenAt?: string | null;
      lastSeenAt?: string | null;
    }>;
  }> {
    const user = await this.userModel
      .findById(params.userId)
      .select('loginDevices')
      .lean()
      .exec();

    const baseId = params.deviceId?.trim()
      ? params.deviceId.trim()
      : `${params.userAgent ?? ''}::${params.ip ?? ''}`;
    const currentDeviceIdHash = baseId ? this.hashDeviceId(baseId) : undefined;

    const devices = (user?.loginDevices ?? [])
      .slice()
      .sort((a, b) => {
        const aTime = a.lastSeenAt ?? a.firstSeenAt ?? 0;
        const bTime = b.lastSeenAt ?? b.firstSeenAt ?? 0;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      })
      .map((item) => ({
        deviceIdHash: item.deviceIdHash,
        userAgent: item.userAgent,
        deviceInfo: item.deviceInfo,
        ip: item.ip,
        location: item.location,
        deviceType: item.deviceType,
        os: item.os,
        browser: item.browser,
        loginMethod: item.loginMethod,
        firstSeenAt: item.firstSeenAt
          ? new Date(item.firstSeenAt).toISOString()
          : null,
        lastSeenAt: item.lastSeenAt
          ? new Date(item.lastSeenAt).toISOString()
          : null,
      }));

    return { currentDeviceIdHash, devices };
  }

  async isLoginDeviceActive(params: {
    userId: string;
    deviceId: string;
  }): Promise<boolean> {
    const deviceIdHash = this.hashDeviceId(params.deviceId);
    const user = await this.userModel
      .findById(params.userId)
      .select('loginDevices')
      .lean()
      .exec();
    return Boolean(
      user?.loginDevices?.some((d) => d.deviceIdHash === deviceIdHash),
    );
  }

  async requestTwoFactorOtp(params: {
    userId: string;
  }): Promise<{ expiresSec: number }> {
    const user = await this.userModel
      .findById(params.userId)
      .select('email status')
      .lean()
      .exec();

    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    if (user.status === 'banned') {
      throw new ForbiddenException('Account is suspended.');
    }

    const { code, expiresMs } = await this.otpService.requestOtp(user.email);
    await this.mailService.sendTwoFactorOtp(
      user.email,
      code,
      Math.floor(expiresMs / 60000),
    );

    return { expiresSec: Math.max(1, Math.ceil(expiresMs / 1000)) };
  }

  async verifyTwoFactorOtp(params: {
    userId: string;
    code: string;
    enable: boolean;
  }): Promise<{ enabled: boolean }> {
    const user = await this.userModel
      .findById(params.userId)
      .select('email')
      .lean()
      .exec();

    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.otpService.verifyOtp(user.email, params.code);
    const update: Record<string, unknown> = {
      $set: { twoFactorEnabled: params.enable },
    };
    if (!params.enable) {
      update['$set'] = {
        twoFactorEnabled: params.enable,
        twoFactorTrustedDevices: [],
      };
    }

    await this.userModel.updateOne({ _id: params.userId }, update).exec();

    return { enabled: params.enable };
  }

  async isTwoFactorTrustedDevice(params: {
    userId: string;
    deviceId: string;
  }): Promise<boolean> {
    const deviceIdHash = this.hashDeviceId(params.deviceId);
    const user = await this.userModel
      .findById(params.userId)
      .select('twoFactorTrustedDevices')
      .lean()
      .exec();
    const now = new Date();
    const trusted = user?.twoFactorTrustedDevices ?? [];
    const valid = trusted.some(
      (d) =>
        d.deviceIdHash === deviceIdHash && d.expiresAt && d.expiresAt > now,
    );
    const expired = trusted.filter((d) => d.expiresAt && d.expiresAt <= now);
    if (expired.length) {
      await this.userModel
        .updateOne(
          { _id: params.userId },
          { $pull: { twoFactorTrustedDevices: { expiresAt: { $lte: now } } } },
        )
        .exec();
    }
    return valid;
  }

  async addTwoFactorTrustedDevice(params: {
    userId: string;
    deviceId: string;
    userAgent?: string;
  }): Promise<void> {
    const deviceIdHash = this.hashDeviceId(params.deviceId);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.twoFactorTrustMs);
    const user = await this.userModel
      .findById(params.userId)
      .select('twoFactorTrustedDevices')
      .exec();
    if (!user) return;

    const current = user.twoFactorTrustedDevices ?? [];
    const idx = current.findIndex((d) => d.deviceIdHash === deviceIdHash);
    const nextItem = {
      deviceIdHash,
      userAgent: params.userAgent ?? '',
      trustedAt: now,
      expiresAt,
    };
    const next = [...current];
    if (idx >= 0) {
      next[idx] = { ...next[idx], ...nextItem } as any;
    } else {
      next.unshift(nextItem as any);
    }
    user.twoFactorTrustedDevices = next.slice(0, this.deviceLimit);
    await user.save();
  }

  async createLoginAlert(params: {
    userId: string;
    deviceInfo?: string;
    deviceType?: string;
    os?: string;
    browser?: string;
    location?: string;
    ip?: string;
    deviceIdHash?: string;
  }): Promise<void> {
    await this.notificationsService.createLoginAlertNotification({
      recipientId: params.userId,
      deviceInfo: params.deviceInfo,
      deviceType: params.deviceType,
      os: params.os,
      browser: params.browser,
      location: params.location,
      ip: params.ip,
      deviceIdHash: params.deviceIdHash,
      loginAt: new Date(),
    });
  }

  async logoutLoginDevice(params: {
    userId: string;
    deviceIdHash: string;
  }): Promise<{ loggedOut: boolean }> {
    if (!params.deviceIdHash) {
      return { loggedOut: false };
    }

    await this.userModel
      .updateOne(
        { _id: params.userId },
        { $pull: { loginDevices: { deviceIdHash: params.deviceIdHash } } },
      )
      .exec();

    await this.sessionModel
      .deleteMany({
        userId: new Types.ObjectId(params.userId),
        deviceIdHash: params.deviceIdHash,
      })
      .exec();

    return { loggedOut: true };
  }

  async logoutAllDevicesExceptCurrent(params: {
    userId: string;
    deviceId?: string;
    userAgent?: string;
    ip?: string;
  }): Promise<{ loggedOut: boolean; currentDeviceIdHash: string }> {
    const baseId = params.deviceId?.trim()
      ? params.deviceId.trim()
      : `${params.userAgent ?? ''}::${params.ip ?? ''}`;
    if (!baseId) {
      throw new BadRequestException('Device identifier is required');
    }
    const currentDeviceIdHash = this.hashDeviceId(baseId);

    await this.userModel
      .updateOne(
        { _id: params.userId },
        {
          $pull: {
            loginDevices: { deviceIdHash: { $ne: currentDeviceIdHash } },
          },
        },
      )
      .exec();

    await this.sessionModel
      .deleteMany({
        userId: new Types.ObjectId(params.userId),
        deviceIdHash: { $ne: currentDeviceIdHash },
      })
      .exec();

    return { loggedOut: true, currentDeviceIdHash };
  }

  async logoutAllDevices(params: {
    userId: string;
  }): Promise<{ loggedOut: boolean }> {
    await this.userModel
      .updateOne({ _id: params.userId }, { $set: { loginDevices: [] } })
      .exec();

    await this.sessionModel
      .deleteMany({ userId: new Types.ObjectId(params.userId) })
      .exec();

    return { loggedOut: true };
  }

  async updateSettings(params: {
    userId: string;
    theme?: 'light' | 'dark';
    language?: 'vi' | 'en' | 'ja' | 'zh';
    dmListFrom?: 'everyone' | 'followers_only';
    dmCallFrom?: 'everyone' | 'followers_only';
    showCordigramMemberSince?: boolean;
    sharePresence?: boolean;
    chatSoundEnabled?: boolean;
  }): Promise<{
    theme: 'light' | 'dark';
    language: 'vi' | 'en' | 'ja' | 'zh';
    dmListFrom: 'everyone' | 'followers_only';
    dmCallFrom: 'everyone' | 'followers_only';
    showCordigramMemberSince: boolean;
    sharePresence: boolean;
    chatSoundEnabled: boolean;
  }> {
    const update: Record<string, unknown> = {};
    if (params.theme) {
      update['settings.theme'] = params.theme;
    }
    if (params.language) {
      update['settings.language'] = params.language;
    }
    if (params.dmListFrom) {
      update['settings.dmListFrom'] = params.dmListFrom;
    }
    if (params.dmCallFrom) {
      update['settings.dmCallFrom'] = params.dmCallFrom;
    }
    if (params.showCordigramMemberSince !== undefined) {
      update['settings.showCordigramMemberSince'] =
        params.showCordigramMemberSince;
    }
    if (params.sharePresence !== undefined) {
      update['settings.sharePresence'] = params.sharePresence;
    }
    if (params.chatSoundEnabled !== undefined) {
      update['settings.chatSoundEnabled'] = params.chatSoundEnabled;
    }

    if (!Object.keys(update).length) {
      return this.getSettings(params.userId);
    }

    await this.userModel
      .updateOne({ _id: params.userId }, { $set: update })
      .exec();

    return this.getSettings(params.userId);
  }

  async createWithGoogle(params: {
    email: string;
    providerId: string;
    refreshToken?: string | null;
  }): Promise<User> {
    return this.userModel.create({
      email: params.email,
      passwordHash: null,
      oauthProviders: [
        {
          provider: 'google',
          providerId: params.providerId,
          refreshToken: params.refreshToken ?? null,
        },
      ],
      roles: ['user'],
      status: 'pending',
      isVerified: true,
      signupStage: 'info_pending',
    });
  }

  async addOrUpdateOAuthProvider(params: {
    userId: string;
    provider: 'google' | 'local';
    providerId: string;
    refreshToken?: string | null;
  }): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: params.userId, 'oauthProviders.provider': params.provider },
        {
          $set: {
            'oauthProviders.$.providerId': params.providerId,
            'oauthProviders.$.refreshToken': params.refreshToken ?? null,
          },
        },
      )
      .exec();

    const exists = await this.userModel
      .findOne({
        _id: params.userId,
        'oauthProviders.provider': params.provider,
      })
      .select('_id')
      .lean()
      .exec();

    if (!exists) {
      await this.userModel
        .updateOne(
          { _id: params.userId },
          {
            $push: {
              oauthProviders: {
                provider: params.provider,
                providerId: params.providerId,
                refreshToken: params.refreshToken ?? null,
              },
            },
          },
        )
        .exec();
    }
  }

  async getRecentAccounts(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('recentAccounts')
      .lean()
      .exec();
    return this.sanitizeRecentAccounts(user?.recentAccounts);
  }

  async upsertRecentAccount(params: {
    userId: string;
    email: string;
    displayName?: string;
    username?: string;
    avatarUrl?: string;
    lastUsed?: Date | string | number;
  }) {
    const nextItem = {
      email: params.email.toLowerCase(),
      displayName: params.displayName,
      username: params.username,
      avatarUrl: params.avatarUrl,
      lastUsed: params.lastUsed ? new Date(params.lastUsed) : new Date(),
    };

    const user = await this.userModel
      .findById(params.userId)
      .select('recentAccounts')
      .lean()
      .exec();

    const current = this.sanitizeRecentAccounts(user?.recentAccounts);
    const filtered = current.filter((item) => item.email !== nextItem.email);
    const nextList = [nextItem, ...filtered].slice(0, 5);

    await this.userModel
      .updateOne({ _id: params.userId }, { $set: { recentAccounts: nextList } })
      .exec();

    return nextList;
  }

  async requestChangeEmailCurrentOtp(params: {
    userId: string;
    password: string;
  }): Promise<{ expiresSec: number }> {
    const user = await this.userModel
      .findById(params.userId)
      .select('email passwordHash')
      .lean()
      .exec();

    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Invalid sign-in method');
    }

    const passwordOk = await bcrypt.compare(params.password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Incorrect password');
    }

    const { code, expiresMs } = await this.otpService.requestOtp(user.email);
    await this.mailService.sendChangeEmailOtp(
      user.email,
      code,
      Math.floor(expiresMs / 60000),
    );

    await this.userModel
      .updateOne(
        { _id: params.userId },
        {
          $set: {
            emailChange: {
              newEmail: null,
              currentVerifiedAt: null,
              newVerifiedAt: null,
              requestedAt: new Date(),
            },
          },
        },
      )
      .exec();

    return { expiresSec: Math.max(1, Math.ceil(expiresMs / 1000)) };
  }

  async requestPasswordChangeOtp(params: {
    userId: string;
  }): Promise<{ expiresSec: number }> {
    const user = await this.userModel
      .findById(params.userId)
      .select('email passwordHash status')
      .lean()
      .exec();

    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    if (user.status === 'banned') {
      throw new ForbiddenException('Account is suspended.');
    }

    if (!user.passwordHash) {
      throw new BadRequestException('Password is not set for this account.');
    }

    const { code, expiresMs } = await this.otpService.requestOtp(user.email);
    await this.mailService.sendChangePasswordOtp(
      user.email,
      code,
      Math.floor(expiresMs / 60000),
    );

    await this.userModel
      .updateOne(
        { _id: params.userId },
        {
          $set: {
            passwordChange: {
              requestedAt: new Date(),
              verifiedAt: null,
            },
          },
        },
      )
      .exec();

    return { expiresSec: Math.max(1, Math.ceil(expiresMs / 1000)) };
  }

  async verifyPasswordChangeOtp(params: {
    userId: string;
    code: string;
  }): Promise<{ verified: boolean }> {
    const user = await this.userModel
      .findById(params.userId)
      .select('email')
      .lean()
      .exec();

    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.otpService.verifyOtp(user.email, params.code);

    await this.userModel
      .updateOne(
        { _id: params.userId },
        { $set: { 'passwordChange.verifiedAt': new Date() } },
      )
      .exec();

    return { verified: true };
  }

  async confirmPasswordChange(params: {
    userId: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<{ updated: boolean }> {
    const user = await this.userModel
      .findById(params.userId)
      .select('passwordHash passwordChange')
      .exec();

    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    if (!user.passwordHash) {
      throw new BadRequestException('Password is not set for this account.');
    }

    if (!user.passwordChange?.verifiedAt) {
      throw new BadRequestException('OTP verification required.');
    }

    if (!this.isPasswordChangeFresh(user.passwordChange?.requestedAt)) {
      throw new BadRequestException('OTP expired. Please request a new code.');
    }

    const currentOk = await bcrypt.compare(
      params.currentPassword,
      user.passwordHash,
    );
    if (!currentOk) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    if (params.currentPassword === params.newPassword) {
      throw new BadRequestException(
        'New password must be different from current password.',
      );
    }

    if (!this.isPasswordStrong(params.newPassword)) {
      throw new BadRequestException(
        'Password must be at least 8 characters and include uppercase, lowercase, and a number.',
      );
    }

    const hash = await bcrypt.hash(
      params.newPassword,
      this.config.bcryptSaltRounds,
    );
    await this.setPassword(params.userId, hash);

    await this.userModel
      .updateOne({ _id: params.userId }, { $set: { passwordChange: null } })
      .exec();

    return { updated: true };
  }

  async requestPasskeyOtp(params: {
    userId: string;
    password: string;
  }): Promise<{ expiresSec: number }> {
    const user = await this.userModel
      .findById(params.userId)
      .select('email passwordHash status')
      .lean()
      .exec();

    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    if (user.status === 'banned') {
      throw new ForbiddenException('Account is suspended.');
    }

    if (!user.passwordHash) {
      throw new BadRequestException('Password is not set for this account.');
    }

    const passwordOk = await bcrypt.compare(params.password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    const { code, expiresMs } = await this.otpService.requestOtp(user.email);
    await this.mailService.sendPasskeyOtp(
      user.email,
      code,
      Math.floor(expiresMs / 60000),
    );

    await this.userModel
      .updateOne(
        { _id: params.userId },
        {
          $set: {
            passkeyChange: {
              requestedAt: new Date(),
              verifiedAt: null,
            },
          },
        },
      )
      .exec();

    return { expiresSec: Math.max(1, Math.ceil(expiresMs / 1000)) };
  }

  async verifyPasskeyOtp(params: { userId: string; code: string }): Promise<{
    verified: boolean;
    hasPasskey: boolean;
    currentPasskey?: string;
  }> {
    const user = await this.userModel
      .findById(params.userId)
      .select('email passkey')
      .lean()
      .exec();

    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.otpService.verifyOtp(user.email, params.code);

    await this.userModel
      .updateOne(
        { _id: params.userId },
        { $set: { 'passkeyChange.verifiedAt': new Date() } },
      )
      .exec();

    return {
      verified: true,
      hasPasskey: Boolean(user.passkey),
      currentPasskey: user.passkey ?? undefined,
    };
  }

  async confirmPasskey(params: {
    userId: string;
    currentPasskey?: string;
    newPasskey: string;
  }): Promise<{ updated: boolean }> {
    const user = await this.userModel
      .findById(params.userId)
      .select('passkey passkeyChange')
      .exec();

    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    if (!user.passkeyChange?.verifiedAt) {
      throw new BadRequestException('OTP verification required.');
    }

    if (!this.isPasswordChangeFresh(user.passkeyChange?.requestedAt)) {
      throw new BadRequestException('OTP expired. Please request a new code.');
    }

    if (!this.isPasskeyValid(params.newPasskey)) {
      throw new BadRequestException('Passkey must be exactly 6 digits.');
    }

    if (user.passkey) {
      if (!params.currentPasskey) {
        throw new BadRequestException('Current passkey is required.');
      }
      if (params.currentPasskey !== user.passkey) {
        throw new UnauthorizedException('Current passkey is incorrect.');
      }
      if (params.newPasskey === user.passkey) {
        throw new BadRequestException(
          'New passkey must be different from current passkey.',
        );
      }
    }

    user.passkey = params.newPasskey;
    user.passkeyEnabled = true;
    user.passkeyChange = null;
    await user.save();

    return { updated: true };
  }

  async verifyDeviceTrust(params: {
    userId: string;
    deviceId: string;
    passkey: string;
    userAgent?: string;
  }): Promise<{ trusted: boolean }> {
    const user = await this.userModel
      .findById(params.userId)
      .select('passkey passkeyEnabled trustedDevices')
      .exec();

    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    if (!user.passkey) {
      throw new BadRequestException('Passkey is not set.');
    }

    if (user.passkeyEnabled === false) {
      throw new BadRequestException('Passkey is disabled.');
    }

    if (!this.isPasskeyValid(params.passkey)) {
      throw new BadRequestException('Passkey must be exactly 6 digits.');
    }

    if (params.passkey !== user.passkey) {
      throw new UnauthorizedException('Passkey is incorrect.');
    }

    const deviceIdHash = this.hashDeviceId(params.deviceId);
    const current = user.trustedDevices ?? [];
    const existingIndex = current.findIndex(
      (item) => item.deviceIdHash === deviceIdHash,
    );
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.passkeyTrustMs);
    const nextItem = {
      deviceIdHash,
      userAgent: params.userAgent?.slice(0, 220) ?? '',
      lastUsed: now,
      expiresAt,
    };
    const nextList = [...current];
    if (existingIndex >= 0) {
      nextList[existingIndex] = { ...nextList[existingIndex], ...nextItem };
    } else {
      nextList.unshift(nextItem as any);
    }
    user.trustedDevices = nextList.slice(0, this.deviceLimit);
    await user.save();

    return { trusted: true };
  }

  async setPasskeyEnabled(params: {
    userId: string;
    enabled: boolean;
  }): Promise<{ enabled: boolean }> {
    const user = await this.userModel
      .findById(params.userId)
      .select('passkey passkeyEnabled trustedDevices')
      .exec();

    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    if (!user.passkey) {
      throw new BadRequestException('Passkey is not set.');
    }

    user.passkeyEnabled = params.enabled;
    if (!params.enabled) {
      user.trustedDevices = [];
    }
    await user.save();

    return { enabled: params.enabled };
  }

  async verifyChangeEmailCurrentOtp(params: {
    userId: string;
    code: string;
  }): Promise<{ verified: boolean }> {
    const user = await this.userModel
      .findById(params.userId)
      .select('email')
      .lean()
      .exec();

    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.otpService.verifyOtp(user.email, params.code);

    await this.userModel
      .updateOne(
        { _id: params.userId },
        { $set: { 'emailChange.currentVerifiedAt': new Date() } },
      )
      .exec();

    return { verified: true };
  }

  async requestChangeEmailNewOtp(params: {
    userId: string;
    newEmail: string;
  }): Promise<{ expiresSec: number }> {
    const normalizedEmail = params.newEmail.trim().toLowerCase();
    const user = await this.userModel
      .findById(params.userId)
      .select('email emailChange')
      .lean()
      .exec();

    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    if (!user.emailChange?.currentVerifiedAt) {
      throw new BadRequestException('Vui lòng xác thực email hiện tại trước.');
    }

    if (normalizedEmail === user.email) {
      throw new BadRequestException('Email mới trùng với email hiện tại.');
    }

    const existing = await this.findByEmail(normalizedEmail);
    if (existing) {
      throw new BadRequestException('Email đã được sử dụng.');
    }

    const { code, expiresMs } =
      await this.otpService.requestOtp(normalizedEmail);
    await this.mailService.sendChangeEmailOtp(
      normalizedEmail,
      code,
      Math.floor(expiresMs / 60000),
    );

    await this.userModel
      .updateOne(
        { _id: params.userId },
        {
          $set: {
            'emailChange.newEmail': normalizedEmail,
            'emailChange.newVerifiedAt': null,
            'emailChange.requestedAt': new Date(),
          },
        },
      )
      .exec();

    return { expiresSec: Math.max(1, Math.ceil(expiresMs / 1000)) };
  }

  async verifyChangeEmailNewOtp(params: {
    userId: string;
    code: string;
  }): Promise<{ updated: boolean; email?: string }> {
    const user = await this.userModel
      .findById(params.userId)
      .select('email emailChange recentAccounts')
      .lean()
      .exec();

    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    const oldEmail = user.email?.toLowerCase?.() ?? '';
    const newEmail = user.emailChange?.newEmail?.toLowerCase?.() ?? '';
    if (!user.emailChange?.currentVerifiedAt || !newEmail) {
      throw new BadRequestException('Yêu cầu đổi email chưa hợp lệ.');
    }

    const existing = await this.findByEmail(newEmail);
    if (existing && existing.id.toString() !== params.userId) {
      throw new BadRequestException('Email đã được sử dụng.');
    }

    await this.otpService.verifyOtp(newEmail, params.code);

    const currentRecent = this.sanitizeRecentAccounts(user?.recentAccounts);
    const hasOld = currentRecent.some((item) => item.email === oldEmail);
    const updatedRecent = hasOld
      ? currentRecent.map((item) =>
          item.email === oldEmail ? { ...item, email: newEmail } : item,
        )
      : [{ email: newEmail, lastUsed: new Date() }, ...currentRecent]
          .filter((item) => item.email)
          .slice(0, 5);

    await this.userModel
      .updateOne(
        { _id: params.userId },
        {
          $set: {
            email: newEmail,
            emailChange: null,
            recentAccounts: updatedRecent,
          },
        },
      )
      .exec();

    return { updated: true, email: newEmail };
  }

  async removeRecentAccount(params: { userId: string; email: string }) {
    const user = await this.userModel
      .findById(params.userId)
      .select('recentAccounts')
      .lean()
      .exec();
    const current = this.sanitizeRecentAccounts(user?.recentAccounts);
    const nextList = current.filter(
      (item) => item.email !== params.email.toLowerCase(),
    );

    await this.userModel
      .updateOne({ _id: params.userId }, { $set: { recentAccounts: nextList } })
      .exec();

    return nextList;
  }

  async clearRecentAccounts(userId: string) {
    await this.userModel
      .updateOne({ _id: userId }, { $set: { recentAccounts: [] } })
      .exec();
    return [] as User['recentAccounts'];
  }

  async follow(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new BadRequestException('Cannot follow yourself');
    }

    const followerId = this.asObjectId(userId, 'userId');
    const followeeId = this.asObjectId(targetUserId, 'targetUserId');

    const blocked = await this.blocksService.isBlockedEither(
      followerId,
      followeeId,
    );
    if (blocked) {
      throw new ForbiddenException('Cannot follow a blocked user');
    }

    const result = await this.followModel
      .updateOne(
        { followerId, followeeId },
        { $setOnInsert: { followerId, followeeId } },
        { upsert: true },
      )
      .exec();

    const inserted = Boolean(
      (result as { upsertedCount?: number }).upsertedCount,
    );
    if (inserted) {
      await Promise.all([
        this.userModel
          .updateOne({ _id: followeeId }, { $inc: { followerCount: 1 } })
          .exec(),
        this.userModel
          .updateOne({ _id: followerId }, { $inc: { followingCount: 1 } })
          .exec(),
      ]);

      await this.notificationsService.createFollowNotification({
        actorId: followerId.toString(),
        recipientId: followeeId.toString(),
      });

      const targetProfile = await this.profileModel
        .findOne({ userId: followeeId })
        .select('displayName username avatarUrl')
        .lean();

      await this.activityLogService.log({
        userId: followerId,
        type: 'follow',
        targetUserId: followeeId,
        meta: {
          targetDisplayName: targetProfile?.displayName ?? null,
          targetUsername: targetProfile?.username ?? null,
          targetAvatarUrl: targetProfile?.avatarUrl ?? null,
        },
      });
    }

    return { following: true };
  }

  async unfollow(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new BadRequestException('Cannot unfollow yourself');
    }

    const followerId = this.asObjectId(userId, 'userId');
    const followeeId = this.asObjectId(targetUserId, 'targetUserId');

    const result = await this.followModel
      .deleteOne({ followerId, followeeId })
      .exec();

    if (result.deletedCount) {
      await Promise.all([
        this.userModel
          .updateOne({ _id: followeeId }, { $inc: { followerCount: -1 } })
          .exec(),
        this.userModel
          .updateOne({ _id: followerId }, { $inc: { followingCount: -1 } })
          .exec(),
      ]);

      await this.notificationsService.removeFollowNotification({
        actorId: followerId.toString(),
        recipientId: followeeId.toString(),
      });
    }

    return { following: false };
  }

  async isFollowing(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      return false;
    }

    const followerId = this.asObjectId(userId, 'userId');
    const followeeId = this.asObjectId(targetUserId, 'targetUserId');

    const follow = await this.followModel
      .findOne({ followerId, followeeId })
      .select('_id')
      .lean()
      .exec();

    return Boolean(follow?._id);
  }

  async getViolationHistory(params: {
    userId: string;
    limit?: number;
  }): Promise<{
    currentStrikeTotal: number;
    items: Array<{
      id: string;
      targetType: 'post' | 'comment' | 'user';
      targetId: string;
      action: string;
      category: string;
      reason: string;
      severity: 'low' | 'medium' | 'high' | null;
      strikeDelta: number;
      strikeTotalAfter: number;
      actionExpiresAt: string | null;
      previewText: string | null;
      previewMedia: { type: 'image' | 'video'; url: string } | null;
      relatedPostId: string | null;
      relatedPostPreview: {
        text: string | null;
        media: { type: 'image' | 'video'; url: string } | null;
      } | null;
      createdAt: string;
    }>;
  }> {
    const userObjectId = this.asObjectId(params.userId, 'userId');
    const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 100);

    const rawActions = await this.moderationActionModel
      .find({
        action: {
          $nin: [
            'no_violation',
            'rollback_moderation',
            'auto_hidden_pending_review',
          ],
        },
        invalidatedAt: null,
      })
      .sort({ createdAt: -1 })
      .limit(300)
      .select(
        'targetType targetId action category reason severity expiresAt createdAt',
      )
      .lean()
      .exec();

    const commentIds = rawActions
      .filter((item) => item.targetType === 'comment' && item.targetId)
      .map((item) => item.targetId);
    const commentRecords = commentIds.length
      ? await this.commentModel
          .find({ _id: { $in: commentIds } })
          .select('_id authorId postId content media')
          .lean()
          .exec()
      : [];
    const relatedPostIdsFromComments = commentRecords
      .map((comment) => comment.postId)
      .filter((id): id is Types.ObjectId => Boolean(id));
    const postIds = Array.from(
      new Set(
        rawActions
          .filter((item) => item.targetType === 'post' && item.targetId)
          .map((item) => item.targetId.toString())
          .concat(relatedPostIdsFromComments.map((id) => id.toString())),
      ),
    ).map((id) => new Types.ObjectId(id));
    const [posts, comments] = await Promise.all([
      postIds.length
        ? this.postModel
            .find({ _id: { $in: postIds } })
            .select('_id authorId content media')
            .lean()
            .exec()
        : Promise.resolve([]),
      Promise.resolve(commentRecords),
    ]);

    const postMap = new Map(posts.map((post) => [post._id.toString(), post]));
    const commentMap = new Map(
      comments.map((comment) => [comment._id.toString(), comment]),
    );

    const mine = rawActions.filter((item) => {
      if (item.targetType === 'post') {
        const post = postMap.get(item.targetId.toString());
        return post?.authorId?.toString() === userObjectId.toString();
      }
      if (item.targetType === 'comment') {
        const comment = commentMap.get(item.targetId.toString());
        return comment?.authorId?.toString() === userObjectId.toString();
      }
      return item.targetId?.toString() === userObjectId.toString();
    });

    const orderedAsc = mine
      .slice()
      .sort(
        (a, b) =>
          new Date(a.createdAt ?? 0).getTime() -
          new Date(b.createdAt ?? 0).getTime(),
      );

    const pickPreviewMedia = (
      media:
        | {
            type?: 'image' | 'video';
            url?: string;
            metadata?: Record<string, unknown> | null;
          }
        | null
        | undefined,
    ): { type: 'image' | 'video'; url: string } | null => {
      if (!media?.url || (media.type !== 'image' && media.type !== 'video')) {
        return null;
      }
      const metadata = media.metadata ?? null;
      const originalSecureUrl =
        metadata && typeof metadata.originalSecureUrl === 'string'
          ? metadata.originalSecureUrl
          : null;
      const originalUrl =
        metadata && typeof metadata.originalUrl === 'string'
          ? metadata.originalUrl
          : null;
      const resolvedUrl = originalSecureUrl ?? originalUrl ?? media.url;
      return {
        type: media.type,
        url: resolvedUrl,
      };
    };

    let runningStrike = 0;
    const withTotals = orderedAsc.map((item) => {
      const strikeDelta =
        item.action === 'strike_decay_auto'
          ? -1
          : item.action === 'warn' ||
              item.action === 'mute_interaction' ||
              item.action === 'creator_verification_approved' ||
              item.action === 'creator_verification_rejected' ||
              item.action === 'creator_verification_revoked' ||
              item.action === 'cancel_ads_campaign' ||
              item.action === 'reopen_ads_campaign'
            ? 0
            : item.severity === 'high'
              ? 3
              : item.severity === 'medium'
                ? 2
                : 1;
      runningStrike = Math.max(0, runningStrike + strikeDelta);

      const previewText =
        item.targetType === 'post'
          ? postMap
              .get(item.targetId.toString())
              ?.content?.trim()
              ?.slice(0, 160) || null
          : item.targetType === 'comment'
            ? commentMap
                .get(item.targetId.toString())
                ?.content?.trim()
                ?.slice(0, 160) || null
            : null;

      const postPreviewMedia =
        item.targetType === 'post'
          ? postMap.get(item.targetId.toString())?.media?.[0]
          : null;
      const commentPreviewMedia =
        item.targetType === 'comment'
          ? commentMap.get(item.targetId.toString())?.media
          : null;
      const previewMedia = pickPreviewMedia(
        postPreviewMedia ?? commentPreviewMedia ?? null,
      );

      const relatedPostId =
        item.targetType === 'post'
          ? item.targetId.toString()
          : item.targetType === 'comment'
            ? (commentMap.get(item.targetId.toString())?.postId?.toString?.() ??
              null)
            : null;

      const relatedPost = relatedPostId ? postMap.get(relatedPostId) : null;
      const relatedPostPreview =
        item.targetType === 'comment'
          ? {
              text: relatedPost?.content?.trim()?.slice(0, 220) ?? null,
              media: pickPreviewMedia(relatedPost?.media?.[0]),
            }
          : null;

      return {
        id: item._id.toString(),
        targetType: item.targetType,
        targetId: item.targetId.toString(),
        action: item.action,
        category: item.category,
        reason: item.reason,
        severity: item.severity ?? null,
        strikeDelta,
        strikeTotalAfter: runningStrike,
        actionExpiresAt: item.expiresAt
          ? new Date(item.expiresAt).toISOString()
          : null,
        previewText,
        previewMedia,
        relatedPostId,
        relatedPostPreview,
        createdAt: item.createdAt
          ? new Date(item.createdAt).toISOString()
          : new Date().toISOString(),
      };
    });

    const user = await this.userModel
      .findById(userObjectId)
      .select('strikeCount')
      .lean()
      .exec();

    return {
      currentStrikeTotal:
        typeof user?.strikeCount === 'number' ? user.strikeCount : 0,
      items: withTotals.reverse().slice(0, limit),
    };
  }

  private asObjectId(id: string, field: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ${field}`);
    }
    return new Types.ObjectId(id);
  }
}
