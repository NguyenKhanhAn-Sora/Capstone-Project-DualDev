import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Follow } from './follow.schema';

@Injectable()
export class FollowsService {
  constructor(
    @InjectModel(Follow.name) private readonly followModel: Model<Follow>,
  ) {}

  async follow(followerId: Types.ObjectId, followeeId: Types.ObjectId): Promise<Follow> {
    // Check if already following
    const existing = await this.followModel.findOne({
      followerId,
      followeeId,
    });

    if (existing) {
      return existing;
    }

    return this.followModel.create({ followerId, followeeId });
  }

  async unfollow(followerId: Types.ObjectId, followeeId: Types.ObjectId): Promise<void> {
    await this.followModel.deleteOne({ followerId, followeeId });
  }

  async getFollowing(userId: Types.ObjectId): Promise<Types.ObjectId[]> {
    const follows = await this.followModel
      .find({ followerId: userId })
      .select('followeeId')
      .lean();
    return follows.map((f) => f.followeeId);
  }

  async getFollowers(userId: Types.ObjectId): Promise<Types.ObjectId[]> {
    const follows = await this.followModel
      .find({ followeeId: userId })
      .select('followerId')
      .lean();
    return follows.map((f) => f.followerId);
  }

  async isFollowing(followerId: Types.ObjectId, followeeId: Types.ObjectId): Promise<boolean> {
    const follow = await this.followModel.findOne({
      followerId,
      followeeId,
    });
    return !!follow;
  }
}
