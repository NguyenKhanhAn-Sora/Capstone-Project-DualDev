import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Ignored } from './ignored.schema';

@Injectable()
export class IgnoredService {
  constructor(
    @InjectModel(Ignored.name) private readonly ignoredModel: Model<Ignored>,
  ) {}

  async addIgnored(userId: string, ignoredUserId: string): Promise<{ ignored: boolean }> {
    if (userId === ignoredUserId) {
      throw new BadRequestException('Cannot ignore yourself');
    }
    const u = this.asObjectId(userId, 'userId');
    const ignored = this.asObjectId(ignoredUserId, 'ignoredUserId');
    const result = await this.ignoredModel
      .updateOne(
        { userId: u, ignoredUserId: ignored },
        { $setOnInsert: { userId: u, ignoredUserId: ignored } },
        { upsert: true },
      )
      .exec();
    return { ignored: true };
  }

  async removeIgnored(userId: string, ignoredUserId: string): Promise<{ ignored: boolean }> {
    if (userId === ignoredUserId) {
      throw new BadRequestException('Invalid');
    }
    const u = this.asObjectId(userId, 'userId');
    const ignored = this.asObjectId(ignoredUserId, 'ignoredUserId');
    await this.ignoredModel.deleteOne({ userId: u, ignoredUserId: ignored }).exec();
    return { ignored: false };
  }

  async isIgnored(viewerId: string | Types.ObjectId, targetId: string | Types.ObjectId): Promise<boolean> {
    const viewer = this.asObjectId(viewerId, 'viewerId');
    const target = this.asObjectId(targetId, 'targetId');
    const doc = await this.ignoredModel
      .findOne({ userId: viewer, ignoredUserId: target })
      .select('_id')
      .lean()
      .exec();
    return Boolean(doc);
  }

  /** Returns set of user IDs that the viewer has ignored (so we hide their messages). */
  async getIgnoredUserIds(viewerId: string | Types.ObjectId): Promise<Set<string>> {
    const viewer = this.asObjectId(viewerId, 'viewerId');
    const docs = await this.ignoredModel
      .find({ userId: viewer })
      .select('ignoredUserId')
      .lean()
      .exec();
    const set = new Set<string>();
    docs.forEach((d) => {
      const id = (d as { ignoredUserId?: Types.ObjectId }).ignoredUserId?.toString?.();
      if (id) set.add(id);
    });
    return set;
  }

  private asObjectId(id: string | Types.ObjectId, field: string): Types.ObjectId {
    if (id instanceof Types.ObjectId) return id;
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException(`Invalid ${field}`);
    return new Types.ObjectId(id);
  }
}
