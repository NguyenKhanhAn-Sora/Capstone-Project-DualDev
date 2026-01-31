import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, PipelineStage } from 'mongoose';
import { Profile } from './profile.schema';
import { Follow } from '../users/follow.schema';
import { Post } from '../posts/post.schema';
import { CompaniesService } from '../companies/companies.service';

@Injectable()
export class ProfilesService {
  constructor(
    @InjectModel(Profile.name) private readonly profileModel: Model<Profile>,
    @InjectModel(Follow.name) private readonly followModel: Model<Follow>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    private readonly companiesService: CompaniesService,
  ) {}

  private escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private readonly DEFAULT_AVATAR_URL =
    'https://res.cloudinary.com/doicocgeo/image/upload/v1765850274/user-avatar-default_gfx5bs.jpg';

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
      location?: string;
      gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
      birthdate?: string;
      workplaceName?: string;
      workplaceCompanyId?: string;
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

        const nextCompanyId = company._id as Types.ObjectId;
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

    return this.profileModel.aggregate(pipeline).exec();
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
    gender?: string;
    location?: string;
    workplace?: { companyId: string; companyName: string };
    birthdate?: string;
    stats: {
      posts: number;
      reels: number;
      totalPosts: number;
      followers: number;
      following: number;
    };
    isFollowing?: boolean;
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

    const viewerId = params.viewerId ? this.asObjectId(params.viewerId) : null;

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

    return {
      id: profile._id?.toString?.() ?? maybeObjectId?.toString?.() ?? '',
      userId: ownerId.toString(),
      displayName: profile.displayName,
      username: profile.username,
      avatarUrl: profile.avatarUrl || this.DEFAULT_AVATAR_URL,
      avatarOriginalUrl: profile.avatarOriginalUrl || this.DEFAULT_AVATAR_URL,
      coverUrl: profile.coverUrl || '',
      bio: profile.bio || '',
      gender: profile.gender || '',
      location: profile.location || '',
      workplace: profile.workplace?.companyId
        ? {
            companyId: (profile.workplace.companyId as any).toString(),
            companyName: profile.workplace.companyName || '',
          }
        : { companyId: '', companyName: profile.workplace?.companyName || '' },
      birthdate: profile.birthdate
        ? new Date(profile.birthdate).toISOString().slice(0, 10)
        : '',
      stats: {
        posts: postsCount,
        reels: reelsCount,
        totalPosts: postsCount + reelsCount,
        followers: followersCount,
        following: followingCount,
      },
      isFollowing: Boolean(viewerFollow),
    };
  }
}
