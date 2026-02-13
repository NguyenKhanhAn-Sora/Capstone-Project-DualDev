import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/user.schema';
import { Post } from '../posts/post.schema';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
  ) {}

  async getStats(): Promise<{
    totalUsers: number;
    postsCreated: number;
    newUsers24h: number;
    newUsersPrev24h: number;
    newUsersDeltaPct: number | null;
    postsCreated7d: number;
    postsCreatedPrev7d: number;
    postsCreatedDeltaPct: number | null;
  }> {
    const now = Date.now();
    const since24h = new Date(now - 24 * 60 * 60 * 1000);
    const since48h = new Date(now - 48 * 60 * 60 * 1000);
    const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const since14d = new Date(now - 14 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      postsCreated,
      newUsers24h,
      newUsersPrev24h,
      postsCreated7d,
      postsCreatedPrev7d,
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
    ]);

    const postsCreatedDeltaPct = postsCreatedPrev7d
      ? ((postsCreated7d - postsCreatedPrev7d) / postsCreatedPrev7d) * 100
      : null;
    const newUsersDeltaPct = newUsersPrev24h
      ? ((newUsers24h - newUsersPrev24h) / newUsersPrev24h) * 100
      : null;

    return {
      totalUsers,
      postsCreated,
      newUsers24h,
      newUsersPrev24h,
      newUsersDeltaPct,
      postsCreated7d,
      postsCreatedPrev7d,
      postsCreatedDeltaPct,
    };
  }
}
