import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Profile } from './profile.schema';

@Injectable()
export class ProfilesService {
  constructor(
    @InjectModel(Profile.name) private readonly profileModel: Model<Profile>,
  ) {}

  private readonly DEFAULT_AVATAR_URL =
    'https://res.cloudinary.com/doicocgeo/image/upload/v1765850274/user-avatar-default_gfx5bs.jpg';

  async createOrUpdate(data: {
    userId: Types.ObjectId;
    displayName: string;
    username: string;
    avatarUrl?: string;
    avatarOriginalUrl?: string;
    avatarPublicId?: string;
    avatarOriginalPublicId?: string;
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
}
