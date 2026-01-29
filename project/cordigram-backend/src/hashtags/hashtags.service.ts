import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Hashtag } from './hashtag.schema';

@Injectable()
export class HashtagsService {
  constructor(
    @InjectModel(Hashtag.name) private readonly hashtagModel: Model<Hashtag>,
  ) {}

  private escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async suggest(params: { q: string; limit?: number }) {
    const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 25);
    const raw = (params.q ?? '').trim().replace(/^#/, '').toLowerCase();
    if (!raw) return [];

    const escaped = this.escapeRegex(raw);
    const prefix = new RegExp(`^${escaped}`, 'i');
    const contains = new RegExp(escaped, 'i');

    const prefixItems = await this.hashtagModel
      .find({ name: { $regex: prefix } })
      .sort({ usageCount: -1, lastUsedAt: -1, name: 1 })
      .limit(limit)
      .select('_id name usageCount lastUsedAt')
      .lean()
      .exec();

    const remaining = limit - prefixItems.length;
    const items =
      remaining > 0
        ? prefixItems.concat(
            await this.hashtagModel
              .find({
                _id: { $nin: prefixItems.map((t) => t._id) },
                name: { $regex: contains },
              })
              .sort({ usageCount: -1, lastUsedAt: -1, name: 1 })
              .limit(remaining)
              .select('_id name usageCount lastUsedAt')
              .lean()
              .exec(),
          )
        : prefixItems;

    return items.map((t) => ({
      id: t._id?.toString?.() ?? (t as any).id,
      name: t.name,
      usageCount: t.usageCount ?? 0,
      lastUsedAt: t.lastUsedAt ?? null,
    }));
  }

  async trending(params: { limit?: number }) {
    const limit = Math.min(Math.max(Number(params.limit) || 15, 1), 50);
    const items = await this.hashtagModel
      .find({})
      .sort({ usageCount: -1, lastUsedAt: -1, name: 1 })
      .limit(limit)
      .select('_id name usageCount lastUsedAt')
      .lean()
      .exec();

    return items.map((t) => ({
      id: t._id?.toString?.() ?? (t as any).id,
      name: t.name,
      usageCount: t.usageCount ?? 0,
      lastUsedAt: t.lastUsedAt ?? null,
    }));
  }
}
