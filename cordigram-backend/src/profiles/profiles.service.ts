import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, PipelineStage } from 'mongoose';
import { Profile } from './profile.schema';
import { Follow } from '../users/follow.schema';
import { Post } from '../posts/post.schema';
import { User } from '../users/user.schema';
import { Block } from '../users/block.schema';
import { Server } from '../servers/server.schema';
import { CompaniesService } from '../companies/companies.service';
import type {
  ProfileFieldVisibility,
  ProfileVisibility,
} from './profile.schema';

@Injectable()
export class ProfilesService {
  constructor(
    @InjectModel(Profile.name) private readonly profileModel: Model<Profile>,
    @InjectModel(Follow.name) private readonly followModel: Model<Follow>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Server.name) private readonly serverModel: Model<Server>,
    @InjectModel(Block.name) private readonly blockModel: Model<Block>,
    private readonly companiesService: CompaniesService,
  ) {}

  private escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private readonly DEFAULT_AVATAR_URL =
    'https://res.cloudinary.com/doicocgeo/image/upload/v1765850274/user-avatar-default_gfx5bs.jpg';

  private readonly DEFAULT_VISIBILITY: ProfileVisibility = {
    gender: 'public',
    birthdate: 'public',
    location: 'public',
    workplace: 'public',
    bio: 'public',
    followers: 'public',
    following: 'public',
    about: 'public',
    profile: 'public',
  };

  private buildAvatarResponse(profile: Profile) {
    return {
      avatarUrl: profile.avatarUrl || this.DEFAULT_AVATAR_URL,
      avatarOriginalUrl: profile.avatarOriginalUrl || this.DEFAULT_AVATAR_URL,
      avatarPublicId: profile.avatarPublicId || '',
      avatarOriginalPublicId: profile.avatarOriginalPublicId || '',
    };
  }

  private asObjectId(input: string | Types.ObjectId): Types.ObjectId | null {
    if (input instanceof Types.ObjectId) return input;
    if (!Types.ObjectId.isValid(input)) return null;
    return new Types.ObjectId(input);
  }

  /** Danh sách máy chủ mà cả viewer và otherUser đều là thành viên. */
  private async listMutualServers(
    viewerId: Types.ObjectId,
    otherUserId: Types.ObjectId,
  ): Promise<
    Array<{ serverId: string; name: string; avatarUrl: string | null }>
  > {
    const servers = await this.serverModel
      .find({ 'members.userId': viewerId })
      .select({ members: 1, name: 1, avatarUrl: 1 })
      .lean()
      .exec();
    const other = otherUserId.toString();
    const out: Array<{ serverId: string; name: string; avatarUrl: string | null }> =
      [];
    for (const s of servers) {
      const sid = (s as { _id?: Types.ObjectId })._id;
      if (!sid) continue;
      const members = (s as { members?: { userId?: Types.ObjectId | string }[] })
        .members;
      if (!Array.isArray(members)) continue;
      const both = members.some((m) => {
        const id = m?.userId;
        if (!id) return false;
        return id instanceof Types.ObjectId
          ? id.equals(otherUserId)
          : String(id) === other;
      });
      if (!both) continue;
      const name = (s as { name?: string }).name?.trim() || 'Máy chủ';
      const avatarUrl =
        (s as { avatarUrl?: string | null }).avatarUrl ?? null;
      out.push({ serverId: sid.toString(), name, avatarUrl });
    }
    out.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    return out;
  }

  /** Người bị chặn / chặn viewer — loại khỏi danh sách follow chung (cùng rules followers). */
  private async getViewerBlockExcludedIds(
    viewerId: Types.ObjectId,
  ): Promise<Types.ObjectId[]> {
    const [blocked, blockedBy] = await Promise.all([
      this.blockModel
        .find({ blockerId: viewerId })
        .select('blockedId')
        .lean()
        .exec(),
      this.blockModel
        .find({ blockedId: viewerId })
        .select('blockerId')
        .lean()
        .exec(),
    ]);
    const out = new Set<string>();
    for (const d of blocked as Array<{ blockedId?: Types.ObjectId }>) {
      const id = d.blockedId?.toString?.();
      if (id) out.add(id);
    }
    for (const d of blockedBy as Array<{ blockerId?: Types.ObjectId }>) {
      const id = d.blockerId?.toString?.();
      if (id) out.add(id);
    }
    return [...out]
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
  }

  /**
   * Follow chung (social): người vừa follow owner vừa follow viewer (giao tập followers).
   */
  private async getMutualFollowersPreview(
    viewerId: Types.ObjectId,
    ownerId: Types.ObjectId,
  ): Promise<{
    count: number;
    users: Array<{
      userId: string;
      username: string;
      displayName: string;
      avatarUrl: string;
    }>;
  }> {
    const coll = this.followModel.collection.name;
    const excluded = await this.getViewerBlockExcludedIds(viewerId);
    const matchFollowersOfOwner: Record<string, unknown> = {
      followeeId: ownerId,
    };
    if (excluded.length) {
      matchFollowersOfOwner.followerId = { $nin: excluded };
    }
    const facet = await this.followModel
      .aggregate<{
        total: Array<{ cnt: number }>;
        sample: Array<{ followerId: Types.ObjectId }>;
      }>([
        { $match: matchFollowersOfOwner },
        {
          $lookup: {
            from: coll,
            let: { uid: '$followerId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$followeeId', viewerId] },
                      { $eq: ['$followerId', '$$uid'] },
                    ],
                  },
                },
              },
              { $limit: 1 },
            ],
            as: 'm',
          },
        },
        { $match: { m: { $ne: [] } } },
        {
          $facet: {
            total: [{ $count: 'cnt' }],
            sample: [{ $limit: 30 }, { $project: { _id: 0, followerId: 1 } }],
          },
        },
      ])
      .exec();
    const row = facet[0];
    const count = row?.total?.[0]?.cnt ?? 0;
    const ids =
      row?.sample
        ?.map((s) => s.followerId?.toString())
        .filter((id): id is string => Boolean(id)) ?? [];
    if (!ids.length) {
      return { count, users: [] };
    }
    const profiles = await this.profileModel
      .find({ userId: { $in: ids.map((id) => new Types.ObjectId(id)) } })
      .select('userId username displayName avatarUrl')
      .lean()
      .exec();
    const profileByUserId = new Map<string, (typeof profiles)[0]>();
    for (const p of profiles) {
      const id = (p as { userId?: Types.ObjectId }).userId?.toString?.();
      if (id) profileByUserId.set(id, p);
    }
    const users = ids
      .map((id) => {
        const p = profileByUserId.get(id) as
          | {
              username?: string;
              displayName?: string;
              avatarUrl?: string;
            }
          | undefined;
        if (!p) return null;
        return {
          userId: id,
          username: p.username ?? '',
          displayName: p.displayName ?? p.username ?? '',
          avatarUrl: p.avatarUrl || this.DEFAULT_AVATAR_URL,
        };
      })
      .filter(Boolean) as Array<{
      userId: string;
      username: string;
      displayName: string;
      avatarUrl: string;
    }>;
    return { count, users };
  }

  async createOrUpdate(data: {
    userId: Types.ObjectId;
    displayName: string;
    username: string;
    avatarUrl?: string;
    avatarOriginalUrl?: string;
    avatarPublicId?: string;
    avatarOriginalPublicId?: string;
    gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say' | '';
    coverUrl?: string;
    bio?: string;
    location?: string;
    links?: Record<string, string>;
    birthdate?: Date | null;
  }): Promise<Profile> {
    const existingUsername = await this.profileModel
      .findOne({ username: data.username })
      .exec();
    if (
      existingUsername &&
      existingUsername.userId.toString() !== data.userId.toString()
    ) {
      throw new BadRequestException('Username already taken');
    }

    const profile = await this.profileModel
      .findOne({ userId: data.userId })
      .exec();
    if (profile) {
      profile.displayName = data.displayName;
      profile.username = data.username;
      profile.avatarUrl = data.avatarUrl ?? profile.avatarUrl;
      profile.avatarOriginalUrl =
        data.avatarOriginalUrl ?? profile.avatarOriginalUrl;
      profile.avatarPublicId = data.avatarPublicId ?? profile.avatarPublicId;
      profile.avatarOriginalPublicId =
        data.avatarOriginalPublicId ?? profile.avatarOriginalPublicId;
      profile.coverUrl = data.coverUrl ?? profile.coverUrl;
      profile.bio = data.bio ?? profile.bio;
      profile.location = data.location ?? profile.location;
      profile.gender = data.gender ?? profile.gender;
      profile.links = data.links ?? profile.links;
      profile.birthdate = data.birthdate ?? profile.birthdate;
      await profile.save();
      return profile;
    }

    return this.profileModel.create({
      userId: data.userId,
      displayName: data.displayName,
      username: data.username,
      avatarUrl: data.avatarUrl ?? this.DEFAULT_AVATAR_URL,
      avatarOriginalUrl: data.avatarOriginalUrl ?? this.DEFAULT_AVATAR_URL,
      avatarPublicId: data.avatarPublicId ?? '',
      avatarOriginalPublicId: data.avatarOriginalPublicId ?? '',
      coverUrl: data.coverUrl ?? '',
      bio: data.bio ?? '',
      location: data.location ?? '',
      gender: data.gender ?? '',
      links: data.links ?? {},
      birthdate: data.birthdate ?? null,
    });
  }

  async isUsernameAvailable(
    username: string,
    excludeUserId?: string,
  ): Promise<boolean> {
    const query: Record<string, unknown> = { username };
    if (excludeUserId) {
      query.userId = { $ne: new Types.ObjectId(excludeUserId) };
    }
    const existing = await this.profileModel
      .findOne(query)
      .select('_id')
      .lean()
      .exec();
    return !existing;
  }

  async findByUserId(userId: string | Types.ObjectId): Promise<Profile | null> {
    const objectId =
      typeof userId === 'string'
        ? Types.ObjectId.isValid(userId)
          ? new Types.ObjectId(userId)
          : null
        : userId;

    if (!objectId) {
      return null;
    }

    return this.profileModel.findOne({ userId: objectId }).exec();
  }

  async updateAvatarForUser(params: {
    userId: string;
    avatarUrl: string;
    avatarOriginalUrl: string;
    avatarPublicId: string;
    avatarOriginalPublicId: string;
  }): Promise<{
    avatarUrl: string;
    avatarOriginalUrl: string;
    avatarPublicId: string;
    avatarOriginalPublicId: string;
  }> {
    const profile = await this.profileModel
      .findOne({ userId: new Types.ObjectId(params.userId) })
      .exec();
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    profile.avatarUrl = params.avatarUrl;
    profile.avatarOriginalUrl = params.avatarOriginalUrl;
    profile.avatarPublicId = params.avatarPublicId;
    profile.avatarOriginalPublicId = params.avatarOriginalPublicId;
    await profile.save();

    return this.buildAvatarResponse(profile);
  }

  async updateForUserId(
    userId: string,
    data: {
      displayName?: string;
      username?: string;
      bio?: string;
      pronouns?: string;
      coverUrl?: string;
      location?: string;
      gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
      birthdate?: string;
      workplaceName?: string;
      workplaceCompanyId?: string;
      genderVisibility?: ProfileFieldVisibility;
      birthdateVisibility?: ProfileFieldVisibility;
      locationVisibility?: ProfileFieldVisibility;
      workplaceVisibility?: ProfileFieldVisibility;
      bioVisibility?: ProfileFieldVisibility;
      followersVisibility?: ProfileFieldVisibility;
      followingVisibility?: ProfileFieldVisibility;
      aboutVisibility?: ProfileFieldVisibility;
      profileVisibility?: ProfileFieldVisibility;
    },
  ): Promise<void> {
    const objectId = this.asObjectId(userId);
    if (!objectId) {
      throw new BadRequestException('Invalid user id');
    }

    const profile = await this.profileModel
      .findOne({ userId: objectId })
      .exec();
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    if (data.username !== undefined) {
      const normalized = data.username.toLowerCase();
      const available = await this.isUsernameAvailable(normalized, userId);
      if (!available) {
        throw new BadRequestException('Username already taken');
      }
      profile.username = normalized;
    }

    if (data.displayName !== undefined) {
      profile.displayName = data.displayName.trim();
    }

    if (data.bio !== undefined) {
      // Preserve user-entered formatting (newlines/spaces). Normalize line endings.
      profile.bio = data.bio.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }

    if (data.pronouns !== undefined) {
      profile.pronouns = data.pronouns.trim().slice(0, 80);
    }

    if (data.coverUrl !== undefined) {
      const trimmed = data.coverUrl.trim();
      profile.coverUrl = trimmed;
    }

    if (data.location !== undefined) {
      profile.location = data.location.trim();
    }

    if (
      data.workplaceName !== undefined ||
      data.workplaceCompanyId !== undefined
    ) {
      const prevCompanyId = profile.workplace?.companyId ?? null;
      const requestedName = (data.workplaceName ?? '').trim();
      const requestedCompanyId = (data.workplaceCompanyId ?? '').trim();

      if (!requestedName && !requestedCompanyId) {
        profile.workplace = { companyId: null, companyName: '' };
        if (prevCompanyId) {
          await this.companiesService.incrementMemberCount(prevCompanyId, -1);
        }
      } else {
        const company = requestedCompanyId
          ? await this.companiesService.findById(requestedCompanyId)
          : await this.companiesService.ensureCompanyByName(requestedName);

        if (!company) {
          throw new BadRequestException('workplace is invalid');
        }

        const nextCompanyId = company._id;
        profile.workplace = {
          companyId: nextCompanyId,
          companyName: company.name,
        };

        const prevIdStr = prevCompanyId?.toString?.() ?? '';
        const nextIdStr = nextCompanyId?.toString?.() ?? '';
        if (
          prevCompanyId &&
          prevIdStr &&
          nextIdStr &&
          prevIdStr !== nextIdStr
        ) {
          await this.companiesService.incrementMemberCount(prevCompanyId, -1);
        }
        if (nextCompanyId && nextIdStr && prevIdStr !== nextIdStr) {
          await this.companiesService.incrementMemberCount(nextCompanyId, 1);
        }
      }
    }

    if (data.gender !== undefined) {
      profile.gender = (data.gender as any) ?? '';
    }

    if (data.birthdate !== undefined) {
      profile.birthdate = data.birthdate ? new Date(data.birthdate) : null;
    }

    if (
      data.genderVisibility !== undefined ||
      data.birthdateVisibility !== undefined ||
      data.locationVisibility !== undefined ||
      data.workplaceVisibility !== undefined ||
      data.bioVisibility !== undefined ||
      data.followersVisibility !== undefined ||
      data.followingVisibility !== undefined ||
      data.aboutVisibility !== undefined ||
      data.profileVisibility !== undefined
    ) {
      const current = {
        ...this.DEFAULT_VISIBILITY,
        ...(profile.visibility ?? {}),
      };
      profile.visibility = {
        gender: data.genderVisibility ?? current.gender ?? 'public',
        birthdate: data.birthdateVisibility ?? current.birthdate ?? 'public',
        location: data.locationVisibility ?? current.location ?? 'public',
        workplace: data.workplaceVisibility ?? current.workplace ?? 'public',
        bio: data.bioVisibility ?? current.bio ?? 'public',
        followers: data.followersVisibility ?? current.followers ?? 'public',
        following: data.followingVisibility ?? current.following ?? 'public',
        about: data.aboutVisibility ?? current.about ?? 'public',
        profile: data.profileVisibility ?? current.profile ?? 'public',
      };
    }

    await profile.save();
  }

  async resetAvatarForUser(userId: string): Promise<{
    avatarUrl: string;
    avatarOriginalUrl: string;
    avatarPublicId: string;
    avatarOriginalPublicId: string;
  }> {
    const profile = await this.profileModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .exec();
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    profile.avatarUrl = this.DEFAULT_AVATAR_URL;
    profile.avatarOriginalUrl = this.DEFAULT_AVATAR_URL;
    profile.avatarPublicId = '';
    profile.avatarOriginalPublicId = '';
    await profile.save();

    return this.buildAvatarResponse(profile);
  }

  async searchProfiles(params: {
    query: string;
    limit?: number;
    excludeUserId?: string;
  }): Promise<
    Array<{
      id: string;
      userId: string;
      username: string;
      displayName: string;
      avatarUrl: string;
      followersCount: number;
      isCreatorVerified: boolean;
    }>
  > {
    const term = params.query?.trim();
    if (!term) return [];

    const limit = Math.min(Math.max(Number(params.limit) || 8, 1), 25);
    const escaped = this.escapeRegex(term.toLowerCase());
    const prefixRegex = new RegExp(`^${escaped}`, 'i');
    const anywhereRegex = new RegExp(escaped, 'i');

    const excludeUserId = params.excludeUserId;
    const exclude =
      excludeUserId && Types.ObjectId.isValid(excludeUserId)
        ? new Types.ObjectId(excludeUserId)
        : null;

    const pipeline: PipelineStage[] = [
      {
        $match: {
          ...(exclude ? { userId: { $ne: exclude } } : {}),
          $or: [
            { username: { $regex: anywhereRegex } },
            { displayName: { $regex: anywhereRegex } },
          ],
        },
      },
      {
        $addFields: {
          prefixUsername: {
            $cond: [
              { $regexMatch: { input: '$username', regex: prefixRegex } },
              1,
              0,
            ],
          },
          prefixDisplay: {
            $cond: [
              { $regexMatch: { input: '$displayName', regex: prefixRegex } },
              1,
              0,
            ],
          },
          usernameLength: { $strLenCP: '$username' },
        },
      },
      {
        $sort: {
          prefixUsername: -1,
          prefixDisplay: -1,
          usernameLength: 1,
          'stats.followersCount': -1,
          createdAt: -1,
        },
      },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          id: { $toString: '$_id' },
          userId: { $toString: '$userId' },
          username: 1,
          displayName: 1,
          avatarUrl: 1,
          followersCount: '$stats.followersCount',
        },
      },
    ];

    const items = (await this.profileModel
      .aggregate(pipeline)
      .exec()) as Array<{
      id: string;
      userId: string;
      username: string;
      displayName: string;
      avatarUrl: string;
      followersCount: number;
      isCreatorVerified?: boolean;
    }>;

    if (!items.length) return [];

    const userIds = items
      .map((item) => item.userId)
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const activeUsers = await this.userModel
      .find({ _id: { $in: userIds }, status: { $ne: 'banned' } })
      .select('_id isCreatorVerified')
      .lean();

    const activeUserIdSet = new Set(
      activeUsers
        .map((item) => item._id?.toString?.())
        .filter((id): id is string => Boolean(id)),
    );

    const creatorVerifiedMap = new Map<string, boolean>();
    activeUsers.forEach((item: any) => {
      const id = item._id?.toString?.();
      if (!id) return;
      creatorVerifiedMap.set(id, Boolean(item.isCreatorVerified));
    });

    return items
      .filter((item) => activeUserIdSet.has(item.userId))
      .map((item) => ({
        ...item,
        isCreatorVerified: creatorVerifiedMap.get(item.userId) ?? false,
      }));
  }

  async getProfileDetails(params: {
    usernameOrId: string;
    viewerId?: string;
  }): Promise<{
    id: string;
    userId: string;
    displayName: string;
    username: string;
    avatarUrl: string;
    avatarOriginalUrl: string;
    coverUrl?: string;
    bio?: string;
    pronouns?: string;
    gender?: string;
    location?: string;
    workplace?: { companyId: string; companyName: string };
    birthdate?: string;
    visibility?: ProfileVisibility;
    stats: {
      posts: number;
      reels: number;
      totalPosts: number;
      followers: number;
      following: number;
    };
    isCreatorVerified?: boolean;
    isFollowing?: boolean;
    /** Ngày tài khoản Cordigram được tạo (cho card hồ sơ). */
    cordigramMemberSince?: string;
    /** Số máy chủ chung với người đang xem (0 nếu không đăng nhập / xem chính mình). */
    mutualServerCount?: number;
    /** Danh sách máy chủ chung (khi có viewer và không xem chính mình). */
    mutualServers?: Array<{
      serverId: string;
      name: string;
      avatarUrl: string | null;
    }>;
    /** Số người theo dõi cả viewer và chủ hồ sơ (giao followers). */
    mutualFollowCount?: number;
    mutualFollowUsers?: Array<{
      userId: string;
      username: string;
      displayName: string;
      avatarUrl: string;
    }>;
  }> {
    const raw = params.usernameOrId?.toString().trim();
    if (!raw) {
      throw new BadRequestException('usernameOrId is required');
    }

    const normalizedUsername = raw.toLowerCase().replace(/^@/, '');
    const maybeObjectId = this.asObjectId(raw);

    const clauses: Record<string, unknown>[] = [];
    if (normalizedUsername) clauses.push({ username: normalizedUsername });
    if (maybeObjectId) {
      clauses.push({ _id: maybeObjectId }, { userId: maybeObjectId });
    }

    const profile = await this.profileModel
      .findOne(clauses.length ? { $or: clauses } : {})
      .lean()
      .exec();

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    const ownerId = this.asObjectId(profile.userId) ?? maybeObjectId;
    if (!ownerId) {
      throw new NotFoundException('Profile owner missing');
    }

    const ownerUser = await this.userModel
      .findById(ownerId)
      .select('status isCreatorVerified createdAt settings')
      .lean();

    if (!ownerUser || ownerUser.status === 'banned') {
      throw new NotFoundException('Account is unavailable');
    }

    const viewerId = params.viewerId ? this.asObjectId(params.viewerId) : null;

    const isOwner = Boolean(viewerId && ownerId && viewerId.equals(ownerId));

    const [
      followersCount,
      followingCount,
      postsCount,
      reelsCount,
      viewerFollow,
    ] = await Promise.all([
      this.followModel.countDocuments({ followeeId: ownerId }),
      this.followModel.countDocuments({ followerId: ownerId }),
      this.postModel.countDocuments({
        authorId: ownerId,
        kind: 'post',
        deletedAt: null,
      }),
      this.postModel.countDocuments({
        authorId: ownerId,
        kind: 'reel',
        deletedAt: null,
      }),
      viewerId
        ? this.followModel.exists({ followerId: viewerId, followeeId: ownerId })
        : Promise.resolve(null),
    ]);

    const visibility = {
      ...this.DEFAULT_VISIBILITY,
      ...(profile.visibility ?? {}),
    };
    const canView = (value: ProfileFieldVisibility) => {
      if (isOwner) return true;
      if (value === 'public') return true;
      if (value === 'followers') return Boolean(viewerFollow);
      return false;
    };

    const canViewGender = canView(visibility.gender);
    const canViewBirthdate = canView(visibility.birthdate);
    const canViewLocation = canView(visibility.location);
    const canViewWorkplace = canView(visibility.workplace);
    const canViewBio = canView(visibility.bio);
    const canViewProfile = canView(visibility.profile);

    if (!canViewProfile) {
      throw new ForbiddenException('Profile is private');
    }

    let mutualServerCount: number | undefined;
    let mutualServers:
      | Array<{ serverId: string; name: string; avatarUrl: string | null }>
      | undefined;
    let mutualFollowCount: number | undefined;
    let mutualFollowUsers:
      | {
          userId: string;
          username: string;
          displayName: string;
          avatarUrl: string;
        }[]
      | undefined;
    if (viewerId && !isOwner) {
      const vid = viewerId;
      const oid = ownerId;
      const [serverList, mutualFollow] = await Promise.all([
        this.listMutualServers(vid, oid),
        this.getMutualFollowersPreview(vid, oid),
      ]);
      mutualServers = serverList.length ? serverList : [];
      mutualServerCount = serverList.length;
      mutualFollowCount = mutualFollow.count;
      mutualFollowUsers = mutualFollow.users;
    }

    const ownerSettings = (ownerUser as { settings?: Record<string, unknown> })
      ?.settings;
    const showMemberSince =
      (ownerSettings?.showCordigramMemberSince as boolean | undefined) !==
      false;
    const cordigramMemberSince =
      showMemberSince &&
      ownerUser &&
      (ownerUser as { createdAt?: Date }).createdAt
        ? new Date((ownerUser as { createdAt: Date }).createdAt).toLocaleDateString(
            'vi-VN',
            {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            },
          )
        : undefined;

    return {
      id: profile._id?.toString?.() ?? maybeObjectId?.toString?.() ?? '',
      userId: ownerId.toString(),
      displayName: profile.displayName,
      username: profile.username,
      avatarUrl: profile.avatarUrl || this.DEFAULT_AVATAR_URL,
      avatarOriginalUrl: profile.avatarOriginalUrl || this.DEFAULT_AVATAR_URL,
      coverUrl: profile.coverUrl || '',
      bio: canViewBio ? profile.bio || '' : '',
      pronouns: canViewProfile
        ? (profile as { pronouns?: string }).pronouns?.trim() || ''
        : '',
      gender: canViewGender ? profile.gender || '' : '',
      location: canViewLocation ? profile.location || '' : '',
      workplace: canViewWorkplace
        ? profile.workplace?.companyId
          ? {
              companyId: (profile.workplace.companyId as any).toString(),
              companyName: profile.workplace.companyName || '',
            }
          : { companyId: '', companyName: profile.workplace?.companyName || '' }
        : { companyId: '', companyName: '' },
      birthdate: canViewBirthdate
        ? profile.birthdate
          ? new Date(profile.birthdate).toISOString().slice(0, 10)
          : ''
        : '',
      visibility,
      stats: {
        posts: postsCount,
        reels: reelsCount,
        totalPosts: postsCount + reelsCount,
        followers: followersCount,
        following: followingCount,
      },
      isCreatorVerified: Boolean(ownerUser?.isCreatorVerified),
      isFollowing: Boolean(viewerFollow),
      cordigramMemberSince,
      mutualServerCount,
      mutualServers,
      mutualFollowCount,
      mutualFollowUsers,
    };
  }
}
