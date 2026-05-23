import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Hashtag } from './hashtag.schema';
import { Post } from '../posts/post.schema';

// Shape returned by the trending aggregation pipeline
interface TrendingRaw {
  _id: string;       // hashtag name
  recentPosts: number;
  score: number;
}

export interface TrendingItem {
  id: string;
  name: string;
  recentPosts: number;
  score: number;
}

@Injectable()
export class HashtagsService {
  constructor(
    @InjectModel(Hashtag.name) private readonly hashtagModel: Model<Hashtag>,
    @InjectModel(Post.name)    private readonly postModel: Model<Post>,
  ) {}

  // ── In-memory cache (15 min TTL) ─────────────────────────────────────────
  private _trendingCache: { data: TrendingItem[]; expiresAt: number } | null = null;
  private readonly CACHE_TTL_MS = 15 * 60 * 1000;

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

  /**
   * Returns trending hashtags using a time-decay score.
   *
   * score = SUM( 1 / (hours_since_post + 2) )  for each post in last 48h
   *
   * A hashtag used 10 times in the past hour scores far higher than one
   * used 100 times over the past month, preventing stale tags from staying
   * at the top permanently. Results are cached for 15 minutes.
   */
  async trending(params: { limit?: number }) {
    const limit = Math.min(Math.max(Number(params.limit) || 15, 1), 50);

    // Serve from cache if still fresh
    if (this._trendingCache && Date.now() < this._trendingCache.expiresAt) {
      return this._trendingCache.data.slice(0, limit);
    }

    const since = new Date(Date.now() - 48 * 60 * 60 * 1000); // last 48 h

    const raw = await this.postModel.aggregate<TrendingRaw>([
      // ── 1. Only published, non-hidden posts from the last 48 h that have hashtags
      {
        $match: {
          createdAt: { $gte: since },
          status: 'published',
          moderationState: { $nin: ['hidden', 'removed'] },
          'hashtags.0': { $exists: true }, // at least one hashtag
        },
      },

      // ── 2. Expand every hashtag into its own document
      { $unwind: '$hashtags' },

      // ── 3. Group by hashtag and accumulate time-decay score
      //       score = SUM( 1 / ( hoursAgo + 2 ) )
      //       $$NOW is evaluated at query-execution time (MongoDB 4.2+)
      {
        $group: {
          _id: '$hashtags',
          recentPosts: { $sum: 1 },
          score: {
            $sum: {
              $divide: [
                1.0,
                {
                  $add: [
                    {
                      $divide: [
                        { $subtract: ['$$NOW', '$createdAt'] },
                        3_600_000, // ms → hours
                      ],
                    },
                    2, // minimum denominator prevents division by ~0
                  ],
                },
              ],
            },
          },
        },
      },

      // ── 4. Sort by score descending, cache top-50 regardless of requested limit
      { $sort: { score: -1 } },
      { $limit: 50 },
    ]);

    const mapped: TrendingItem[] = raw.map((r) => ({
      id: r._id,
      name: r._id,
      recentPosts: r.recentPosts,
      score: Math.round(r.score * 100) / 100,
    }));

    // Populate cache
    this._trendingCache = {
      data: mapped,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    };

    return mapped.slice(0, limit);
  }

  async search(params: { q: string; limit?: number; page?: number }) {
    const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 50);
    const page = Math.min(Math.max(Number(params.page) || 1, 1), 100);
    const raw = (params.q ?? '').trim().replace(/^#/, '').toLowerCase();
    if (!raw) return { items: [], count: 0, hasMore: false };

    const escaped = this.escapeRegex(raw);
    const contains = new RegExp(escaped, 'i');
    const filter = { name: { $regex: contains } };

    const [items, total] = await Promise.all([
      this.hashtagModel
        .find(filter)
        .sort({ usageCount: -1, lastUsedAt: -1, name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('_id name usageCount lastUsedAt')
        .lean()
        .exec(),
      this.hashtagModel.countDocuments(filter).exec(),
    ]);

    const mapped = items.map((t) => ({
      id: t._id?.toString?.() ?? (t as any).id,
      name: t.name,
      usageCount: t.usageCount ?? 0,
      lastUsedAt: t.lastUsedAt ?? null,
    }));

    return {
      items: mapped,
      count: total,
      hasMore: page * limit < total,
    };
  }
}
