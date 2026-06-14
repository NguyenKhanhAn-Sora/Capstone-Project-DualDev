import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Story } from './story.schema';
import { CreateStoryDto } from './dto/create-story.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { Follow } from '../users/follow.schema';
import { Profile } from '../profiles/profile.schema';

type UploadedFile = {
  buffer: Buffer;
  mimetype: string;
  size?: number;
  originalname?: string;
};

export type StoryFeedGroup = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  isCreatorVerified: boolean;
  stories: StoryItem[];
  hasUnviewed: boolean;
  latestStoryAt: string;
};

export type StoryItem = {
  id: string;
  type: 'media' | 'text';
  mediaType: 'image' | 'video' | null;
  mediaUrl: string | null;
  mediaDurationMs: number | null;
  trimStartMs: number | null;
  trimEndMs: number | null;
  textContent: string | null;
  backgroundStyle: string | null;
  textOverlays: any[];
  stickers: any[];
  location: string | null;
  music: { trackId: string; title: string; artist: string; coverUrl: string; audioUrl: string; startTime: number; stickerX: number; stickerY: number; stickerWidth: number } | null;
  viewCount: number;
  reactionCount: number;
  viewed: boolean;
  myReaction: string | null;
  visibility: 'public' | 'followers' | 'private';
  createdAt: string;
  expiresAt: string;
};

@Injectable()
export class StoriesService {
  constructor(
    @InjectModel(Story.name) private readonly storyModel: Model<Story>,
    @InjectModel(Follow.name) private readonly followModel: Model<Follow>,
    @InjectModel(Profile.name) private readonly profileModel: Model<Profile>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async uploadStoryMedia(
    userId: string,
    file: UploadedFile,
  ): Promise<{ url: string; type: 'image' | 'video'; mediaDurationMs?: number }> {
    const isVideo = file.mimetype.startsWith('video/');
    const isImage = file.mimetype.startsWith('image/');
    if (!isImage && !isVideo) {
      throw new BadRequestException('Only image or video files are allowed');
    }

    const result = await this.cloudinaryService.uploadBuffer({
      buffer: file.buffer,
      folder: 'stories',
      resourceType: isVideo ? 'video' : 'image',
    });

    return {
      url: result.secureUrl,
      type: isVideo ? 'video' : 'image',
      mediaDurationMs: result.duration ? Math.round(result.duration * 1000) : undefined,
    };
  }

  async createStory(userId: string, dto: CreateStoryDto): Promise<StoryItem> {
    const type = dto.type ?? (dto.mediaUrl ? 'media' : 'text');

    if (type === 'media' && !dto.mediaUrl) {
      throw new BadRequestException('mediaUrl is required for media stories');
    }
    if (type === 'text' && !dto.textContent && !dto.backgroundStyle) {
      throw new BadRequestException('textContent or backgroundStyle is required for text stories');
    }

    const story = await this.storyModel.create({
      authorId: new Types.ObjectId(userId),
      type,
      mediaType: dto.mediaType ?? null,
      mediaUrl: dto.mediaUrl ?? null,
      mediaDurationMs: dto.mediaDurationMs ?? null,
      trimStartMs: dto.trimStartMs ?? null,
      trimEndMs: dto.trimEndMs ?? null,
      textContent: dto.textContent ?? null,
      backgroundStyle: dto.backgroundStyle ?? null,
      textOverlays: dto.textOverlays ?? [],
      stickers: dto.stickers ?? [],
      visibility: dto.visibility ?? 'followers',
      location: dto.location ?? null,
      music: dto.music ? {
        trackId: dto.music.trackId,
        title: dto.music.title,
        artist: dto.music.artist,
        coverUrl: dto.music.coverUrl,
        audioUrl: dto.music.audioUrl,
        startTime: dto.music.startTime ?? 0,
        stickerX: dto.music.stickerX ?? 5,
        stickerY: dto.music.stickerY ?? 72,
        stickerWidth: dto.music.stickerWidth ?? 90,
      } : null,
      views: [],
      reactions: [],
    });

    return this.mapStoryItem(story, userId);
  }

  async deleteStory(userId: string, storyId: string): Promise<{ deleted: boolean }> {
    const story = await this.storyModel.findById(storyId);
    if (!story) throw new NotFoundException('Story not found');
    if (story.authorId.toString() !== userId) {
      throw new ForbiddenException("Cannot delete another user's story");
    }
    await story.deleteOne();
    return { deleted: true };
  }

  async getFeed(viewerId: string): Promise<StoryFeedGroup[]> {
    const follows = await this.followModel
      .find({ followerId: new Types.ObjectId(viewerId) })
      .lean();
    const followedIds = follows.map((f) => f.followeeId);

    const now = new Date();
    const stories = await this.storyModel
      .find({
        expiresAt: { $gt: now },
        $or: [
          // Story của chính mình — luôn thấy dù visibility là gì
          { authorId: new Types.ObjectId(viewerId) },
          // Story của người mình follow — thấy public + followers, không thấy private
          ...(followedIds.length > 0
            ? [{ authorId: { $in: followedIds }, visibility: { $in: ['public', 'followers'] } }]
            : []),
          // Story public của bất kỳ ai — kể cả người không follow
          { visibility: 'public' },
        ],
      })
      .sort({ authorId: 1, createdAt: -1 })
      .lean();

    if (!stories.length) return [];

    const uniqueAuthorIds = [...new Set(stories.map((s) => (s as any).authorId.toString()))];
    const profiles = await this.profileModel
      .find({ userId: { $in: uniqueAuthorIds.map((id) => new Types.ObjectId(id)) } })
      .lean();
    const profileMap = new Map(profiles.map((p) => [p.userId.toString(), p]));

    const grouped = new Map<string, typeof stories>();
    for (const story of stories) {
      const aid = (story as any).authorId.toString();
      if (!grouped.has(aid)) grouped.set(aid, []);
      grouped.get(aid)!.push(story);
    }

    const groups: StoryFeedGroup[] = [];

    const myGroupStories = grouped.get(viewerId);
    if (myGroupStories) {
      groups.push(this.buildGroup(viewerId, myGroupStories as any, viewerId, profileMap.get(viewerId)));
    }

    for (const [aid, storyList] of grouped) {
      if (aid === viewerId) continue;
      groups.push(this.buildGroup(aid, storyList as any, viewerId, profileMap.get(aid)));
    }

    groups.sort((a, b) => {
      if (a.hasUnviewed && !b.hasUnviewed) return -1;
      if (!a.hasUnviewed && b.hasUnviewed) return 1;
      return new Date(b.latestStoryAt).getTime() - new Date(a.latestStoryAt).getTime();
    });

    return groups;
  }

  async getMyStories(userId: string): Promise<StoryItem[]> {
    const stories = await this.storyModel
      .find({ authorId: new Types.ObjectId(userId), expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .lean();
    return stories.map((s) => this.mapStoryItem(s as any, userId));
  }

  async markViewed(viewerId: string, storyId: string): Promise<{ viewed: boolean }> {
    const story = await this.storyModel.findById(storyId);
    if (!story) throw new NotFoundException('Story not found');

    const alreadyViewed = story.views.some((v) => v.userId.toString() === viewerId);
    if (!alreadyViewed) {
      story.views.push({ userId: new Types.ObjectId(viewerId), viewedAt: new Date() } as any);
      await story.save();
    }
    return { viewed: true };
  }

  async getViewers(
    requesterId: string,
    storyId: string,
  ): Promise<{ viewers: any[]; totalViews: number }> {
    const story = await this.storyModel.findById(storyId).lean();
    if (!story) throw new NotFoundException('Story not found');
    if ((story as any).authorId.toString() !== requesterId) {
      throw new ForbiddenException('Only the story author can see viewers');
    }

    const viewerIds = (story as any).views.map((v: any) => v.userId);
    const profiles = await this.profileModel.find({ userId: { $in: viewerIds } }).lean();
    const profileMap = new Map(profiles.map((p) => [p.userId.toString(), p]));

    const reactionMap = new Map(
      ((story as any).reactions ?? []).map((r: any) => [r.userId.toString(), r.emoji as string]),
    );

    const followDocs = await this.followModel
      .find({ followerId: new Types.ObjectId(requesterId), followeeId: { $in: viewerIds.map((id: any) => new Types.ObjectId(id.toString())) } })
      .lean();
    const followingSet = new Set(followDocs.map((f) => f.followeeId.toString()));

    const viewers = (story as any).views.map((v: any) => {
      const profile = profileMap.get(v.userId.toString());
      return {
        userId: v.userId.toString(),
        viewedAt: v.viewedAt,
        username: (profile as any)?.username ?? null,
        displayName: (profile as any)?.displayName ?? null,
        avatarUrl: (profile as any)?.avatarUrl ?? null,
        reaction: reactionMap.get(v.userId.toString()) ?? null,
        isFollowing: followingSet.has(v.userId.toString()),
      };
    });

    return { viewers, totalViews: viewers.length };
  }

  async reactToStory(
    viewerId: string,
    storyId: string,
    emoji: string,
  ): Promise<{ ok: boolean }> {
    const story = await this.storyModel.findById(storyId);
    if (!story) throw new NotFoundException('Story not found');

    const existingIdx = story.reactions.findIndex((r) => r.userId.toString() === viewerId);
    if (existingIdx >= 0) {
      story.reactions[existingIdx].emoji = emoji;
    } else {
      story.reactions.push({ userId: new Types.ObjectId(viewerId), emoji, createdAt: new Date() } as any);
    }
    await story.save();
    return { ok: true };
  }

  async removeReaction(viewerId: string, storyId: string): Promise<{ ok: boolean }> {
    await this.storyModel.updateOne(
      { _id: new Types.ObjectId(storyId) },
      { $pull: { reactions: { userId: new Types.ObjectId(viewerId) } } },
    );
    return { ok: true };
  }

  async updateVisibility(
    userId: string,
    storyId: string,
    visibility: 'public' | 'followers' | 'private',
  ): Promise<{ visibility: 'public' | 'followers' | 'private'; updated: boolean }> {
    const story = await this.storyModel.findById(storyId);
    if (!story) throw new NotFoundException('Story not found');
    if (story.authorId.toString() !== userId) {
      throw new ForbiddenException("Cannot update another user's story");
    }
    if ((story as any).visibility === visibility) {
      return { visibility, updated: false };
    }
    (story as any).visibility = visibility;
    await story.save();
    return { visibility, updated: true };
  }

  // ─── helpers ─────────────────────────────────────────────────────────────────

  private buildGroup(
    authorId: string,
    stories: Story[],
    viewerId: string,
    profile: any,
  ): StoryFeedGroup {
    const sorted = [...stories].sort(
      (a, b) =>
        new Date((a as any).createdAt).getTime() - new Date((b as any).createdAt).getTime(),
    );

    const hasUnviewed = sorted.some(
      (s) => !(s as any).views?.some((v: any) => v.userId?.toString() === viewerId),
    );

    return {
      userId: authorId,
      username: profile?.username ?? '',
      displayName: profile?.displayName ?? '',
      avatarUrl: profile?.avatarUrl ?? '',
      isCreatorVerified: profile?.isCreatorVerified ?? false,
      stories: sorted.map((s) => this.mapStoryItem(s, viewerId)),
      hasUnviewed,
      latestStoryAt: sorted.length
        ? (sorted[sorted.length - 1] as any).createdAt?.toISOString?.() ?? new Date().toISOString()
        : new Date().toISOString(),
    };
  }

  private mapStoryItem(story: Story, viewerId: string): StoryItem {
    const viewed = (story.views ?? []).some((v) => v.userId?.toString() === viewerId);
    const myReaction =
      (story.reactions ?? []).find((r) => r.userId?.toString() === viewerId)?.emoji ?? null;
    return {
      id: (story as any)._id?.toString() ?? (story as any).id,
      type: story.type,
      mediaType: story.mediaType,
      mediaUrl: story.mediaUrl,
      mediaDurationMs: story.mediaDurationMs,
      trimStartMs: (story as any).trimStartMs ?? null,
      trimEndMs: (story as any).trimEndMs ?? null,
      textContent: story.textContent,
      backgroundStyle: story.backgroundStyle,
      textOverlays: story.textOverlays ?? [],
      stickers: story.stickers ?? [],
      location: story.location,
      music: (story as any).music
        ? {
            trackId: (story as any).music.trackId,
            title: (story as any).music.title,
            artist: (story as any).music.artist,
            coverUrl: (story as any).music.coverUrl,
            audioUrl: (story as any).music.audioUrl,
            startTime: (story as any).music.startTime ?? 0,
            stickerX: (story as any).music.stickerX ?? 5,
            stickerY: (story as any).music.stickerY ?? 72,
            stickerWidth: (story as any).music.stickerWidth ?? 90,
          }
        : null,
      viewCount: story.views?.length ?? 0,
      reactionCount: story.reactions?.length ?? 0,
      viewed,
      myReaction,
      visibility: (story as any).visibility ?? 'followers',
      createdAt: (story as any).createdAt?.toISOString?.() ?? new Date().toISOString(),
      expiresAt: (story as any).expiresAt?.toISOString?.() ?? new Date().toISOString(),
    };
  }
}
