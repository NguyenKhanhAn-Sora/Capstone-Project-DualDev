import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { HashtagsService } from '../hashtags/hashtags.service';
import { ProfilesService } from '../profiles/profiles.service';
import { BlocksService } from '../users/blocks.service';
import { Follow } from '../users/follow.schema';
import { Post } from '../posts/post.schema';
import {
  PostInteraction,
  InteractionType,
} from '../posts/post-interaction.schema';
import { Profile } from '../profiles/profile.schema';
import {
  SearchHistory,
  SearchHistoryKind,
  SearchHistoryItem,
} from './search-history.schema';

const HISTORY_LIMIT = 20;

@Injectable()
export class SearchService {
  constructor(
    private readonly profilesService: ProfilesService,
    private readonly hashtagsService: HashtagsService,
    private readonly blocksService: BlocksService,
    @InjectModel(SearchHistory.name)
    private readonly historyModel: Model<SearchHistory>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(PostInteraction.name)
    private readonly postInteractionModel: Model<PostInteraction>,
    @InjectModel(Follow.name) private readonly followModel: Model<Follow>,
    @InjectModel(Profile.name) private readonly profileModel: Model<Profile>,
  ) {}

  private asObjectId(value: string, field: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`${field} is invalid`);
    }
    return new Types.ObjectId(value);
  }

  async suggest(params: { viewerId: string; q: string; limit?: number }) {
    const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 25);
    const raw = (params.q ?? '').trim();
    const viewerId = params.viewerId;

    const tokenized = raw.startsWith('@')
      ? { kind: 'profile' as const, q: raw.replace(/^@+/, '') }
      : raw.startsWith('#')
        ? { kind: 'hashtag' as const, q: raw.replace(/^#+/, '') }
        : { kind: 'all' as const, q: raw };

    if (!tokenized.q.trim()) {
      return { items: [], count: 0 };
    }

    if (tokenized.kind === 'profile') {
      const people = await this.profilesService.searchProfiles({
        query: tokenized.q,
        limit,
        excludeUserId: viewerId,
      });

      return {
        items: people.map((p) => ({
          type: 'profile' as const,
          id: p.userId,
          label: p.displayName,
          subtitle: '@' + p.username,
          imageUrl: p.avatarUrl,
          data: p,
        })),
        count: people.length,
      };
    }

    if (tokenized.kind === 'hashtag') {
      const tags = await this.hashtagsService.suggest({
        q: tokenized.q,
        limit,
      });
      return {
        items: tags.map((t) => ({
          type: 'hashtag' as const,
          id: t.name,
          label: '#' + t.name,
          subtitle: `${t.usageCount ?? 0} posts`,
          imageUrl: '',
          data: t,
        })),
        count: tags.length,
      };
    }

    const [people, tags] = await Promise.all([
      this.profilesService.searchProfiles({
        query: tokenized.q,
        limit: Math.min(limit, 8),
        excludeUserId: viewerId,
      }),
      this.hashtagsService.suggest({
        q: tokenized.q,
        limit: Math.min(limit, 8),
      }),
    ]);

    const items = [
      ...people.map((p) => ({
        type: 'profile' as const,
        id: p.userId,
        label: p.displayName,
        subtitle: '@' + p.username,
        imageUrl: p.avatarUrl,
        data: p,
      })),
      ...tags.map((t) => ({
        type: 'hashtag' as const,
        id: t.name,
        label: '#' + t.name,
        subtitle: `${t.usageCount ?? 0} posts`,
        imageUrl: '',
        data: t,
      })),
    ].slice(0, limit);

    return { items, count: items.length };
  }

  private toPostResponse(
    doc: any,
    profile?: {
      userId?: Types.ObjectId;
      displayName?: string;
      username?: string;
      avatarUrl?: string;
    } | null,
    userFlags?: {
      liked?: boolean;
      saved?: boolean;
      following?: boolean;
      reposted?: boolean;
    } | null,
  ) {
    return {
      kind: doc.kind,
      id: doc._id?.toString?.() ?? doc.id,
      authorId: doc.authorId?.toString?.(),
      authorDisplayName: profile?.displayName,
      authorUsername: profile?.username,
      authorAvatarUrl: profile?.avatarUrl,
      author: profile
        ? {
            id: profile.userId?.toString?.(),
            displayName: profile.displayName,
            username: profile.username,
            avatarUrl: profile.avatarUrl,
          }
        : undefined,
      content: doc.content,
      media: doc.media,
      hashtags: doc.hashtags,
      mentions: doc.mentions,
      topics: doc.topics,
      location: doc.location,
      visibility: doc.visibility,
      allowComments: doc.allowComments,
      allowDownload: doc.allowDownload,
      hideLikeCount: doc.hideLikeCount,
      status: doc.status,
      scheduledAt: doc.scheduledAt,
      publishedAt: doc.publishedAt,
      notificationsMutedUntil: doc.notificationsMutedUntil ?? null,
      notificationsMutedIndefinitely: Boolean(
        doc.notificationsMutedIndefinitely,
      ),
      stats: doc.stats,
      spamScore: doc.spamScore,
      qualityScore: doc.qualityScore,
      repostOf: doc.repostOf,
      serverId: doc.serverId,
      channelId: doc.channelId,
      liked: userFlags?.liked ?? false,
      saved: userFlags?.saved ?? false,
      following: userFlags?.following ?? false,
      reposted: userFlags?.reposted ?? false,
      flags: {
        liked: userFlags?.liked ?? false,
        saved: userFlags?.saved ?? false,
        following: userFlags?.following ?? false,
        reposted: userFlags?.reposted ?? false,
      },
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async searchPosts(params: {
    viewerId: string;
    q: string;
    limit?: number;
    page?: number;
    kinds?: Array<'post' | 'reel'>;
    sort?: 'trending';
  }) {
    const viewerObjectId = this.asObjectId(params.viewerId, 'viewerId');
    const raw = (params.q ?? '').trim();
    const term = raw.replace(/^\s+|\s+$/g, '');
    if (!term) throw new BadRequestException('Invalid query');

    const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 40);
    const page = Math.min(Math.max(Number(params.page) || 1, 1), 50);
    const skip = (page - 1) * limit;

    const hidden = await this.postInteractionModel
      .find({ userId: viewerObjectId, type: { $in: ['hide', 'report'] } })
      .select('postId')
      .lean();
    const hiddenObjectIds = hidden
      .map((h) => h.postId)
      .filter(Boolean)
      .map((id) => new Types.ObjectId(id));

    const followees = await this.followModel
      .find({ followerId: viewerObjectId })
      .select('followeeId')
      .lean();
    const followeeIds = followees.map((f) => f.followeeId.toString());
    const followeeSet = new Set(followeeIds);
    const followeeObjectIds = followeeIds.map((id) => new Types.ObjectId(id));

    const { blockedIds, blockedByIds } =
      await this.blocksService.getBlockLists(viewerObjectId);
    const excludedAuthorIds = Array.from(
      new Set([...blockedIds, ...blockedByIds]),
      (id) => new Types.ObjectId(id),
    );

    const match: any = {
      $text: { $search: term },
      status: 'published',
      deletedAt: null,
      publishedAt: { $ne: null },
      authorId: { $nin: excludedAuthorIds },
      _id: { $nin: hiddenObjectIds },
      $or: [
        { authorId: viewerObjectId },
        { visibility: 'public' },
        { visibility: 'followers', authorId: { $in: followeeObjectIds } },
      ],
    };

    if (params.kinds?.length) {
      match.kind = { $in: params.kinds };
    }

    const projection: any = {
      score: { $meta: 'textScore' },
      kind: 1,
      authorId: 1,
      content: 1,
      media: 1,
      hashtags: 1,
      mentions: 1,
      topics: 1,
      location: 1,
      visibility: 1,
      allowComments: 1,
      allowDownload: 1,
      hideLikeCount: 1,
      status: 1,
      scheduledAt: 1,
      publishedAt: 1,
      notificationsMutedUntil: 1,
      notificationsMutedIndefinitely: 1,
      stats: 1,
      spamScore: 1,
      qualityScore: 1,
      repostOf: 1,
      serverId: 1,
      channelId: 1,
      createdAt: 1,
      updatedAt: 1,
    };

    const baseProjection: any = { ...projection };
    delete baseProjection.score;

    // Prepare a base match we can reuse for fallbacks (MongoDB doesn't allow two $or
    // blocks at the same level, so we normalize into $and).
    const visibilityOr = match.$or;
    const baseMatch: any = { ...match };
    delete baseMatch.$text;
    delete baseMatch.$or;
    baseMatch.$and = [{ $or: visibilityOr }];

    const textMatch: any = { ...baseMatch, $text: { $search: term } };

    const sortMode = params.sort === 'trending' ? 'trending' : 'relevance';
    const trendingSort: any = {
      'stats.views': -1,
      'stats.impressions': -1,
      'stats.hearts': -1,
      'stats.comments': -1,
      'stats.saves': -1,
      'stats.reposts': -1,
      createdAt: -1,
    };

    let posts = await this.postModel
      .find(textMatch, projection)
      .sort(
        sortMode === 'trending'
          ? { ...trendingSort, score: { $meta: 'textScore' } }
          : { score: { $meta: 'textScore' }, ...trendingSort },
      )
      .skip(skip)
      .limit(limit)
      .lean();

    // MongoDB $text doesn't support prefix matching (e.g. "neuvil" won't match
    // "neuvillette"). Fall back to a safe regex substring match.
    if (!posts.length) {
      const escapeRegExp = (value: string) =>
        value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const tokens = term
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 4)
        .map(escapeRegExp);
      const totalLen = tokens.reduce((acc, t) => acc + t.length, 0);

      // Avoid overly-broad regex scans.
      if (tokens.length && totalLen >= 3) {
        const rx = new RegExp(tokens.join('.*'), 'i');
        const regexMatch: any = {
          ...baseMatch,
          $and: [
            ...(baseMatch.$and ?? []),
            { $or: [{ content: rx }, { hashtags: rx }, { topics: rx }] },
          ],
        };

        posts = await this.postModel
          .find(regexMatch, baseProjection)
          .sort(trendingSort)
          .skip(skip)
          .limit(limit)
          .lean();
      }
    }

    if (!posts.length) {
      return { page, limit, hasMore: false, items: [] };
    }

    const authorIds = Array.from(
      new Set(posts.map((p) => p.authorId?.toString?.()).filter(Boolean)),
    ).map((id) => new Types.ObjectId(id));

    const profiles = await this.profileModel
      .find({ userId: { $in: authorIds } })
      .select('userId displayName username avatarUrl')
      .lean();
    const profileMap = new Map(profiles.map((p) => [p.userId.toString(), p]));

    const postIds = posts.map((p) => p._id);
    const interactions = await this.postInteractionModel
      .find({
        userId: viewerObjectId,
        postId: { $in: postIds },
        type: { $in: ['like', 'save', 'repost'] as InteractionType[] },
      })
      .select('postId type')
      .lean();

    const interactionMap = new Map<
      string,
      { liked?: boolean; saved?: boolean; reposted?: boolean }
    >();

    interactions.forEach((item) => {
      const key = item.postId?.toString?.();
      if (!key) return;
      const current = interactionMap.get(key) || {};
      if (item.type === 'like') current.liked = true;
      if (item.type === 'save') current.saved = true;
      if (item.type === 'repost') current.reposted = true;
      interactionMap.set(key, current);
    });

    const items = posts.map((post) => {
      const profile = profileMap.get(post.authorId?.toString?.() ?? '') || null;
      const flags = interactionMap.get(post._id?.toString?.() ?? '') || {};
      const following = post.authorId
        ? followeeSet.has(post.authorId.toString())
        : false;
      return this.toPostResponse(post, profile, { ...flags, following });
    });

    return { page, limit, hasMore: posts.length === limit, items };
  }

  private buildHistoryKey(kind: SearchHistoryKind, parts: string[]) {
    return `${kind}:${parts.join(':')}`;
  }

  async getHistory(params: { viewerId: string }) {
    const viewerObjectId = this.asObjectId(params.viewerId, 'viewerId');
    const doc = await this.historyModel
      .findOne({ userId: viewerObjectId })
      .lean()
      .exec();

    const base = (doc?.items ?? [])
      .slice()
      .filter((i: any) => i?.kind !== 'company')
      .sort((a: any, b: any) => {
        const at = a?.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
        const bt = b?.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
        if (bt !== at) return bt - at;
        return String(b?._id ?? '').localeCompare(String(a?._id ?? ''));
      })
      .slice(0, HISTORY_LIMIT);

    // Enrich legacy post history items that were saved before we started
    // storing media preview + author username.
    const postIdsToEnrich = Array.from(
      new Set(
        base
          .filter((i: any) => i?.kind === 'post' || i?.kind === 'reel')
          .filter((i: any) => {
            const hasImage = Boolean(String(i?.imageUrl ?? '').trim());
            const label = String(i?.label ?? '').trim();
            const hasSubtitle = Boolean(String(i?.subtitle ?? '').trim());
            return (
              !hasImage ||
              !label ||
              label === 'Post' ||
              label === 'Reel' ||
              !hasSubtitle
            );
          })
          .map((i: any) => String(i?.refId ?? '').trim())
          .filter((id: string) => Types.ObjectId.isValid(id)),
      ),
    );

    let postMap = new Map<
      string,
      {
        id: string;
        authorId?: string;
        content?: string;
        media?: any[];
        visibility?: string;
      }
    >();
    let authorUsernameMap = new Map<string, string>();
    let followeeSet = new Set<string>();

    if (postIdsToEnrich.length) {
      const postObjectIds = postIdsToEnrich.map((id) => new Types.ObjectId(id));
      const posts = await this.postModel
        .find({
          _id: { $in: postObjectIds },
          status: 'published',
          deletedAt: null,
          publishedAt: { $ne: null },
        } as any)
        .select('_id authorId content media visibility')
        .lean();

      const authorIds = Array.from(
        new Set(
          posts.map((p: any) => p?.authorId?.toString?.()).filter(Boolean),
        ),
      );

      const { blockedIds, blockedByIds } =
        await this.blocksService.getBlockLists(viewerObjectId);
      const excludedAuthorSet = new Set(
        [...(blockedIds ?? []), ...(blockedByIds ?? [])].map((x: any) =>
          x?.toString?.(),
        ),
      );

      if (authorIds.length) {
        const follows = await this.followModel
          .find({
            followerId: viewerObjectId,
            followeeId: { $in: authorIds.map((id) => new Types.ObjectId(id)) },
          })
          .select('followeeId')
          .lean();
        followeeSet = new Set(
          follows.map((f: any) => f.followeeId?.toString?.()).filter(Boolean),
        );

        const profiles = await this.profileModel
          .find({
            userId: { $in: authorIds.map((id) => new Types.ObjectId(id)) },
          })
          .select('userId username')
          .lean();

        const usernameEntries = (profiles ?? [])
          .map((p: any) => {
            const id = p.userId?.toString?.();
            const username = String(p.username ?? '').trim();
            return id && username ? ([id, username] as [string, string]) : null;
          })
          .filter(Boolean) as Array<[string, string]>;
        authorUsernameMap = new Map(usernameEntries);
      }

      posts.forEach((p: any) => {
        const id = p?._id?.toString?.();
        if (!id) return;
        const authorId = p?.authorId?.toString?.();
        if (authorId && excludedAuthorSet.has(authorId)) return;

        const visibility = String(p?.visibility ?? 'public');
        const isAuthor = authorId && authorId === viewerObjectId.toString();
        const canSee =
          visibility === 'public' ||
          (visibility === 'followers' &&
            (isAuthor || followeeSet.has(authorId))) ||
          (visibility === 'private' && isAuthor);
        if (!canSee) return;

        postMap.set(id, {
          id,
          authorId,
          content: p?.content,
          media: p?.media,
          visibility,
        });
      });
    }

    const items = base.map((item: any) => {
      if (item?.kind === 'post' || item?.kind === 'reel') {
        const refId = String(item?.refId ?? '').trim();
        const post = refId ? postMap.get(refId) : undefined;
        if (post) {
          const first = Array.isArray(post.media) ? post.media[0] : null;
          const mediaUrl = String(first?.url ?? '').trim();
          const mediaType =
            first?.type === 'video'
              ? 'video'
              : first?.type === 'image'
                ? 'image'
                : '';
          const username = post.authorId
            ? authorUsernameMap.get(post.authorId) || ''
            : '';
          const labelFromPost = String(post.content ?? '').trim();
          const existingLabel = String(item.label ?? '').trim();
          const label = labelFromPost
            ? labelFromPost.slice(0, 60)
            : existingLabel === 'Post'
              ? ''
              : existingLabel === 'Reel'
                ? ''
                : String(item.label ?? '');
          const kindLabel = item?.kind === 'reel' ? 'Reel' : 'Post';
          const subtitle = username
            ? `${kindLabel} by @${username.replace(/^@+/, '')}`
            : String(item.subtitle ?? '');

          return {
            id: item._id?.toString?.() ?? '',
            kind: item.kind,
            key: item.key,
            label: label ?? '',
            subtitle: subtitle ?? '',
            imageUrl: mediaUrl || String(item.imageUrl ?? ''),
            mediaType: mediaType || String(item.mediaType ?? ''),
            refId: item.refId ?? '',
            refSlug: item.refSlug ?? '',
            lastUsedAt: item.lastUsedAt ?? null,
          };
        }
      }

      return {
        id: item._id?.toString?.() ?? '',
        kind: item.kind,
        key: item.key,
        label: item.label ?? '',
        subtitle: item.subtitle ?? '',
        imageUrl: item.imageUrl ?? '',
        mediaType: item.mediaType ?? '',
        refId: item.refId ?? '',
        refSlug: item.refSlug ?? '',
        lastUsedAt: item.lastUsedAt ?? null,
      };
    });

    return items;
  }

  async addHistory(params: { viewerId: string; input: any }) {
    const viewerObjectId = this.asObjectId(params.viewerId, 'viewerId');

    const kind = String(params.input?.kind ?? '').trim() as SearchHistoryKind;
    if (!['profile', 'hashtag', 'post', 'reel', 'query'].includes(kind)) {
      throw new BadRequestException('kind is invalid');
    }

    const now = new Date();

    let key = '';
    let label = '';
    let subtitle = '';
    let imageUrl = '';
    let mediaType: '' | 'image' | 'video' = '';
    let refId = '';
    let refSlug = '';

    if (kind === 'profile') {
      const userId = String(params.input?.userId ?? '').trim();
      const username = String(params.input?.username ?? '').trim();
      const displayName = String(params.input?.displayName ?? '').trim();
      const avatarUrl = String(params.input?.avatarUrl ?? '').trim();
      if (!Types.ObjectId.isValid(userId))
        throw new BadRequestException('userId is invalid');
      key = this.buildHistoryKey('profile', [userId]);
      label = displayName || username || 'Profile';
      subtitle = username ? '@' + username.replace(/^@+/, '') : '';
      imageUrl = avatarUrl;
      refId = userId;
      refSlug = username.replace(/^@+/, '');
    }

    if (kind === 'hashtag') {
      const tag = String(params.input?.tag ?? params.input?.name ?? '').trim();
      const normalized = tag.replace(/^#/, '').toLowerCase();
      if (!normalized) throw new BadRequestException('tag is required');
      key = this.buildHistoryKey('hashtag', [normalized]);
      label = '#' + normalized;
      subtitle = '';
      refSlug = normalized;
    }

    if (kind === 'post' || kind === 'reel') {
      const postId = String(params.input?.postId ?? '').trim();
      const content = String(params.input?.content ?? '').trim();
      const mediaUrl = String(
        params.input?.mediaUrl ?? params.input?.imageUrl ?? '',
      ).trim();
      const authorUsername = String(params.input?.authorUsername ?? '').trim();
      const rawMediaType = String(params.input?.mediaType ?? '').trim();
      if (!Types.ObjectId.isValid(postId))
        throw new BadRequestException('postId is invalid');
      key = this.buildHistoryKey(kind, [postId]);
      // Prefer caption; if empty, keep empty (UI can show a placeholder like "(no caption)").
      label = content ? content.slice(0, 60) : '';
      const kindLabel = kind === 'reel' ? 'Reel' : 'Post';
      subtitle = authorUsername
        ? `${kindLabel} by @${authorUsername.replace(/^@+/, '')}`
        : '';
      imageUrl = mediaUrl;
      mediaType =
        rawMediaType === 'video'
          ? 'video'
          : rawMediaType === 'image'
            ? 'image'
            : '';
      refId = postId;
    }

    if (kind === 'query') {
      const query = String(params.input?.query ?? '').trim();
      if (!query) throw new BadRequestException('query is required');
      key = this.buildHistoryKey('query', [query.toLowerCase()]);
      label = query;
    }

    const update = await this.historyModel
      .findOne({ userId: viewerObjectId })
      .exec();

    const nextItem: any = {
      key,
      kind,
      label,
      subtitle,
      imageUrl,
      mediaType,
      refId,
      refSlug,
      lastUsedAt: now,
    } satisfies Partial<SearchHistoryItem>;

    if (!update) {
      const created = await this.historyModel.create({
        userId: viewerObjectId,
        items: [nextItem],
      });
      const item = (created.items?.[0] as any) || null;
      return {
        id: item?._id?.toString?.() ?? '',
        kind,
        key,
        label,
        subtitle,
        imageUrl,
        mediaType,
        refId,
        refSlug,
        lastUsedAt: now,
      };
    }

    const existingIndex = (update.items ?? []).findIndex(
      (i: any) => i.key === key,
    );
    if (existingIndex >= 0) {
      update.items.splice(existingIndex, 1);
    }
    update.items.unshift(nextItem as any);
    // Defensive cleanup: remove any legacy company entries from history.
    update.items = (update.items ?? [])
      .filter((i: any) => i?.kind !== 'company')
      .slice(0, HISTORY_LIMIT) as any;
    await update.save();

    const saved = (update.items?.[0] as any) || null;
    return {
      id: saved?._id?.toString?.() ?? '',
      kind,
      key,
      label,
      subtitle,
      imageUrl,
      mediaType,
      refId,
      refSlug,
      lastUsedAt: now,
    };
  }

  async clearHistory(params: { viewerId: string }) {
    const viewerObjectId = this.asObjectId(params.viewerId, 'viewerId');
    await this.historyModel
      .updateOne(
        { userId: viewerObjectId },
        { $set: { items: [] } },
        { upsert: true },
      )
      .exec();
  }

  async deleteHistoryItem(params: { viewerId: string; itemId: string }) {
    const viewerObjectId = this.asObjectId(params.viewerId, 'viewerId');
    if (!Types.ObjectId.isValid(params.itemId)) {
      throw new BadRequestException('id is invalid');
    }

    await this.historyModel
      .updateOne(
        { userId: viewerObjectId },
        { $pull: { items: { _id: new Types.ObjectId(params.itemId) } } },
      )
      .exec();
  }
}
