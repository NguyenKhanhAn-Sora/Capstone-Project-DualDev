import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Ignored } from './ignored.schema';
import { Profile } from '../profiles/profile.schema';

@Injectable()
export class IgnoredService {
  constructor(
    @InjectModel(Ignored.name) private readonly ignoredModel: Model<Ignored>,
    @InjectModel(Profile.name) private readonly profileModel: Model<Profile>,
  ) {}

  async addIgnored(
    userId: string,
    ignoredUserId: string,
  ): Promise<{ ignored: boolean }> {
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

  async removeIgnored(
    userId: string,
    ignoredUserId: string,
  ): Promise<{ ignored: boolean }> {
    if (userId === ignoredUserId) {
      throw new BadRequestException('Invalid');
    }
    const u = this.asObjectId(userId, 'userId');
    const ignored = this.asObjectId(ignoredUserId, 'ignoredUserId');
    await this.ignoredModel
      .deleteOne({ userId: u, ignoredUserId: ignored })
      .exec();
    return { ignored: false };
  }

  async isIgnored(
    viewerId: string | Types.ObjectId,
    targetId: string | Types.ObjectId,
  ): Promise<boolean> {
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
  async getIgnoredUserIds(
    viewerId: string | Types.ObjectId,
  ): Promise<Set<string>> {
    const viewer = this.asObjectId(viewerId, 'viewerId');
    const docs = await this.ignoredModel
      .find({ userId: viewer })
      .select('ignoredUserId')
      .lean()
      .exec();
    const set = new Set<string>();
    docs.forEach((d) => {
      const id = (
        d as { ignoredUserId?: Types.ObjectId }
      ).ignoredUserId?.toString?.();
      if (id) set.add(id);
    });
    return set;
  }

  /** For settings UI: list ignored users with profile fields. */
  async listIgnoredUsers(
    viewerId: string | Types.ObjectId,
  ): Promise<
    Array<{
      userId: string;
      username?: string;
      displayName?: string;
      avatarUrl?: string;
    }>
  > {
    const viewer = this.asObjectId(viewerId, 'viewerId');
    const docs = await this.ignoredModel
      .find({ userId: viewer })
      .select('ignoredUserId')
      .lean()
      .exec();
    const ids = Array.from(
      new Set(
        (docs as Array<{ ignoredUserId?: Types.ObjectId }>)
          .map((d) => d.ignoredUserId?.toString?.() ?? '')
          .filter(Boolean),
      ),
    );
    if (!ids.length) return [];

    const profiles = await this.profileModel
      .find({ userId: { $in: ids.map((id) => new Types.ObjectId(id)) } })
      .select('userId username displayName avatarUrl')
      .lean()
      .exec();
    const byUserId = new Map<string, (typeof profiles)[0]>();
    for (const p of profiles) {
      const uid = (p as any)?.userId?.toString?.();
      if (uid) byUserId.set(uid, p);
    }

    return ids.map((id) => {
      const p = byUserId.get(id) as
        | { username?: string; displayName?: string; avatarUrl?: string }
        | undefined;
      return {
        userId: id,
        username: p?.username,
        displayName: p?.displayName,
        avatarUrl: p?.avatarUrl,
      };
    });
  }

  private asObjectId(
    id: string | Types.ObjectId,
    field: string,
  ): Types.ObjectId {
    if (id instanceof Types.ObjectId) return id;
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException(`Invalid ${field}`);
    return new Types.ObjectId(id);
  }
}
