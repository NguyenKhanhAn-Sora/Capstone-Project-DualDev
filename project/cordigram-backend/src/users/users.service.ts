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

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Follow.name) private readonly followModel: Model<Follow>,
    private readonly blocksService: BlocksService,
  ) {}

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
    }

    return { following: false };
  }

  private asObjectId(id: string, field: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ${field}`);
    }
    return new Types.ObjectId(id);
  }
}
