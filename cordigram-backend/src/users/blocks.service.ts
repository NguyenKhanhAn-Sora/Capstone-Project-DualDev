import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Block } from './block.schema';
import { Follow } from './follow.schema';
import { User } from './user.schema';

@Injectable()
export class BlocksService {
  constructor(
    @InjectModel(Block.name) private readonly blockModel: Model<Block>,
    @InjectModel(Follow.name) private readonly followModel: Model<Follow>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async isBlocked(
    blockerId: string | Types.ObjectId,
    blockedId: string | Types.ObjectId,
  ) {
    const blocker = this.asObjectId(blockerId, 'blockerId');
    const blocked = this.asObjectId(blockedId, 'blockedId');
    const exists = await this.blockModel
      .findOne({ blockerId: blocker, blockedId: blocked })
      .select('_id')
      .lean()
      .exec();
    return Boolean(exists);
  }

  async isBlockedEither(
    userA: string | Types.ObjectId,
    userB: string | Types.ObjectId,
  ) {
    const a = this.asObjectId(userA, 'userA');
    const b = this.asObjectId(userB, 'userB');
    const exists = await this.blockModel
      .findOne({
        $or: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      })
      .select('_id')
      .lean()
      .exec();
    return Boolean(exists);
  }

  async block(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) {
      throw new BadRequestException('Cannot block yourself');
    }

    const blocker = this.asObjectId(blockerId, 'blockerId');
    const blocked = this.asObjectId(blockedId, 'blockedId');

    const result = await this.blockModel
      .updateOne(
        { blockerId: blocker, blockedId: blocked },
        { $setOnInsert: { blockerId: blocker, blockedId: blocked } },
        { upsert: true },
      )
      .exec();

    const created = Boolean(
      (result as { upsertedCount?: number }).upsertedCount,
    );

    if (created) {
      await this.removeFollowPair(blocker, blocked);
    }

    return { blocked: true, created };
  }

  async unblock(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) {
      throw new BadRequestException('Cannot unblock yourself');
    }

    const blocker = this.asObjectId(blockerId, 'blockerId');
    const blocked = this.asObjectId(blockedId, 'blockedId');

    await this.blockModel
      .deleteOne({ blockerId: blocker, blockedId: blocked })
      .exec();
    return { blocked: false };
  }

  async getBlockLists(userId: string | Types.ObjectId) {
    const viewerId = this.asObjectId(userId, 'userId');
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

    const blockedIds = new Set<string>();
    const blockedByIds = new Set<string>();

    blocked.forEach((doc) => {
      const id = doc.blockedId?.toString?.();
      if (id) blockedIds.add(id);
    });
    blockedBy.forEach((doc) => {
      const id = doc.blockerId?.toString?.();
      if (id) blockedByIds.add(id);
    });

    return { blockedIds, blockedByIds };
  }

  async assertNotBlocked(viewerId: Types.ObjectId, ownerId: Types.ObjectId) {
    const blocked = await this.isBlockedEither(viewerId, ownerId);
    if (blocked) {
      throw new ForbiddenException('Action forbidden due to block');
    }
  }

  private async removeFollowPair(a: Types.ObjectId, b: Types.ObjectId) {
    const [ab, ba] = await Promise.all([
      this.followModel.deleteOne({ followerId: a, followeeId: b }).exec(),
      this.followModel.deleteOne({ followerId: b, followeeId: a }).exec(),
    ]);

    const adjustments: Array<Promise<unknown>> = [];

    if (ab.deletedCount) {
      adjustments.push(
        this.userModel
          .updateOne({ _id: b }, { $inc: { followerCount: -1 } })
          .exec(),
        this.userModel
          .updateOne({ _id: a }, { $inc: { followingCount: -1 } })
          .exec(),
      );
    }

    if (ba.deletedCount) {
      adjustments.push(
        this.userModel
          .updateOne({ _id: a }, { $inc: { followerCount: -1 } })
          .exec(),
        this.userModel
          .updateOne({ _id: b }, { $inc: { followingCount: -1 } })
          .exec(),
      );
    }

    if (adjustments.length) {
      await Promise.all(adjustments);
    }
  }

  private asObjectId(id: string | Types.ObjectId, field: string) {
    if (id instanceof Types.ObjectId) {
      return id;
    }
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ${field}`);
    }
    return new Types.ObjectId(id);
  }
}
