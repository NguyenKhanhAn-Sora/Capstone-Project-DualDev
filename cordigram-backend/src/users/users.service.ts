import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from './user.schema';
import { Follow } from './follow.schema';
import { BlocksService } from './blocks.service';
import { Profile } from '../profiles/profile.schema';
import { UserTasteProfile } from '../explore/user-taste.schema';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Follow.name) private readonly followModel: Model<Follow>,
    @InjectModel(Profile.name) private readonly profileModel: Model<Profile>,
    @InjectModel(UserTasteProfile.name)
    private readonly tasteProfileModel: Model<UserTasteProfile>,
    private readonly blocksService: BlocksService,
    private readonly notificationsService: NotificationsService,
  ) {}

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
      .filter(Boolean) as string[];

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
          followerId: viewerId,
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
      .filter(Boolean) as string[];

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
          followerId: viewerId,
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
        .find({ _id: { $nin: excludedObjectIds } })
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
        .select('_id followerCount')
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

    const sameCompanySet = new Set(sameCompanyIds);
    const tasteWeightMap = new Map<string, number>();
    tasteAuthorWeights.forEach((t) => tasteWeightMap.set(t.userId, t.w));

    const scored = Array.from(candidateSet)
      .filter((id) => !excluded.has(id))
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

  async setPassword(userId: string, passwordHash: string): Promise<void> {
    await this.userModel.updateOne({ _id: userId }, { passwordHash }).exec();
  }

  async completeSignup(userId: string): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: userId },
        { signupStage: 'completed', status: 'active', isVerified: true },
      )
      .exec();
  }

  async getSettings(userId: string): Promise<{ theme: 'light' | 'dark' }> {
    const user = await this.userModel
      .findById(userId)
      .select('settings')
      .lean()
      .exec();

    return { theme: user?.settings?.theme ?? 'light' };
  }

  async updateSettings(params: {
    userId: string;
    theme?: 'light' | 'dark';
  }): Promise<{ theme: 'light' | 'dark' }> {
    const update: Record<string, unknown> = {};
    if (params.theme) {
      update['settings.theme'] = params.theme;
    }

    if (!Object.keys(update).length) {
      const current = await this.getSettings(params.userId);
      return current;
    }

    await this.userModel
      .updateOne({ _id: params.userId }, { $set: update })
      .exec();

    const next = await this.getSettings(params.userId);
    return next;
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

  private asObjectId(id: string, field: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ${field}`);
    }
    return new Types.ObjectId(id);
  }
}
