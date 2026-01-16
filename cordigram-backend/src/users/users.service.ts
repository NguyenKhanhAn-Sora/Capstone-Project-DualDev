import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './user.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email }).exec();
  }

<<<<<<< HEAD
  findById(userId: string): Promise<User | null> {
    return this.userModel.findById(userId).exec();
  }

=======
>>>>>>> origin/Cordigram-social-chat
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

<<<<<<< HEAD
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

=======
>>>>>>> origin/Cordigram-social-chat
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
}
