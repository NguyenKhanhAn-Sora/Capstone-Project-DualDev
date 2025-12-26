import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateReelDto } from './dto/create-reel.dto';
import { Post, PostStatus, PostStats } from './post.schema';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { ConfigService } from '../config/config.service';
type UploadedFile = {
  buffer: Buffer;
  mimetype: string;
  size?: number;
  originalname?: string;
};

const REEL_MAX_DURATION_SECONDS = 90;

@Injectable()
export class PostsService {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    private readonly cloudinary: CloudinaryService,
    private readonly config: ConfigService,
  ) {}

  async create(authorId: string, dto: CreatePostDto) {
    const normalizedHashtags = this.normalizeHashtags(dto.hashtags ?? []);
    const normalizedMentions = this.normalizeMentions(dto.mentions ?? []);

    let media = (dto.media ?? []).map((item) => ({
      type: item.type,
      url: item.url.trim(),
      metadata: item.metadata ?? null,
    }));

    let repostOf: Types.ObjectId | null = null;

    if (!media.length && !dto.repostOf) {
      throw new BadRequestException(
        'Please provide media or a repostOf target',
      );
    }

    if (dto.repostOf) {
      repostOf = new Types.ObjectId(dto.repostOf);
      const original = await this.postModel
        .findOne({ _id: repostOf, deletedAt: null })
        .lean();
      if (!original) {
        throw new NotFoundException('Original post not found');
      }
      if (!media.length) {
        media = (original.media ?? []).map((item) => ({
          type: item.type,
          url: item.url,
          metadata: item.metadata ?? null,
        }));
      }
    }

    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduledAt value');
    }

    const now = new Date();
    const status: PostStatus =
      scheduledAt && scheduledAt.getTime() > now.getTime()
        ? 'scheduled'
        : 'published';
    const publishedAt = status === 'published' ? now : null;

    const stats: PostStats = {
      hearts: 0,
      comments: 0,
      saves: 0,
      reposts: 0,
    };

    const doc = await this.postModel.create({
      kind: 'post',
      authorId: new Types.ObjectId(authorId),
      serverId: dto.serverId ? new Types.ObjectId(dto.serverId) : null,
      channelId: dto.channelId ? new Types.ObjectId(dto.channelId) : null,
      repostOf,
      content: typeof dto.content === 'string' ? dto.content : '',
      media,
      hashtags: normalizedHashtags,
      mentions: normalizedMentions,
      location: dto.location?.trim() || null,
      visibility: dto.visibility ?? 'public',
      allowComments: dto.allowComments ?? true,
      allowDownload: dto.allowDownload ?? false,
      status,
      scheduledAt: scheduledAt ?? null,
      publishedAt,
      stats,
      deletedAt: null,
    });

    if (repostOf) {
      await this.postModel
        .updateOne({ _id: repostOf }, { $inc: { 'stats.reposts': 1 } })
        .exec();
    }

    return this.toResponse(doc);
  }

  async createReel(authorId: string, dto: CreateReelDto) {
    const normalizedHashtags = this.normalizeHashtags(dto.hashtags ?? []);
    const normalizedMentions = this.normalizeMentions(dto.mentions ?? []);

    const media = (dto.media ?? []).map((item) => ({
      type: item.type,
      url: item.url.trim(),
      metadata: item.metadata ?? null,
    }));

    if (media.length !== 1 || media[0].type !== 'video') {
      throw new BadRequestException('Reels require exactly one video');
    }

    const duration =
      this.extractVideoDuration(media[0].metadata) ??
      dto.durationSeconds ??
      null;

    if (duration === null) {
      throw new BadRequestException('Missing video duration metadata');
    }

    if (duration > REEL_MAX_DURATION_SECONDS) {
      throw new BadRequestException(
        `Video exceeds ${REEL_MAX_DURATION_SECONDS} seconds limit`,
      );
    }

    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduledAt value');
    }

    const now = new Date();
    const status: PostStatus =
      scheduledAt && scheduledAt.getTime() > now.getTime()
        ? 'scheduled'
        : 'published';
    const publishedAt = status === 'published' ? now : null;

    const stats: PostStats = {
      hearts: 0,
      comments: 0,
      saves: 0,
      reposts: 0,
    };

    const doc = await this.postModel.create({
      kind: 'reel',
      authorId: new Types.ObjectId(authorId),
      serverId: dto.serverId ? new Types.ObjectId(dto.serverId) : null,
      channelId: dto.channelId ? new Types.ObjectId(dto.channelId) : null,
      repostOf: null,
      content: typeof dto.content === 'string' ? dto.content : '',
      media,
      hashtags: normalizedHashtags,
      mentions: normalizedMentions,
      location: dto.location?.trim() || null,
      visibility: dto.visibility ?? 'public',
      allowComments: dto.allowComments ?? true,
      allowDownload: dto.allowDownload ?? false,
      status,
      scheduledAt: scheduledAt ?? null,
      publishedAt,
      stats,
      deletedAt: null,
    });

    return this.toResponse(doc);
  }

  private normalizeHashtags(tags: string[]): string[] {
    return Array.from(
      new Set(
        (tags ?? [])
          .map((tag) => tag?.toString().trim().replace(/^#/, '').toLowerCase())
          .filter(Boolean),
      ),
    ).slice(0, 30);
  }

  private normalizeMentions(handles: string[]): string[] {
    return Array.from(
      new Set(
        (handles ?? [])
          .map((h) => h?.toString().trim().replace(/^@/, '').toLowerCase())
          .filter(Boolean),
      ),
    ).slice(0, 30);
  }

  private toResponse(doc: Post) {
    return {
      kind: doc.kind,
      id: doc.id,
      content: doc.content,
      media: doc.media,
      hashtags: doc.hashtags,
      mentions: doc.mentions,
      location: doc.location,
      visibility: doc.visibility,
      allowComments: doc.allowComments,
      allowDownload: doc.allowDownload,
      status: doc.status,
      scheduledAt: doc.scheduledAt,
      publishedAt: doc.publishedAt,
      stats: doc.stats,
      repostOf: doc.repostOf,
      serverId: doc.serverId,
      channelId: doc.channelId,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private extractVideoDuration(
    metadata?: Record<string, unknown> | null,
  ): number | null {
    const raw = (metadata as { duration?: unknown } | null | undefined)
      ?.duration;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
      return raw;
    }
    if (typeof raw === 'string') {
      const num = Number(raw);
      if (Number.isFinite(num) && num >= 0) {
        return num;
      }
    }
    return null;
  }

  async uploadMedia(authorId: string, file: UploadedFile) {
    if (!file) {
      throw new BadRequestException('Missing file');
    }

    return this.uploadSingle(authorId, file);
  }

  async uploadMediaBatch(authorId: string, files: UploadedFile[]) {
    if (!files || !files.length) {
      throw new BadRequestException('Missing files');
    }

    const uploads = [] as Array<{
      folder: string;
      url: string;
      secureUrl: string;
      publicId: string;
      resourceType: string;
      bytes: number;
      format?: string;
      width?: number;
      height?: number;
      duration?: number;
      originalName?: string;
    }>;

    for (const file of files) {
      const result = await this.uploadSingle(authorId, file);
      uploads.push({ ...result, originalName: file.originalname });
    }

    return uploads;
  }

  private buildUploadFolder(authorId: string): string {
    const now = new Date();
    const parts = [
      this.config.cloudinaryFolder,
      'posts',
      authorId,
      now.getFullYear().toString(),
      `${now.getMonth() + 1}`.padStart(2, '0'),
    ].filter(Boolean);

    return parts.join('/');
  }

  private async uploadSingle(authorId: string, file: UploadedFile) {
    const resourceType = file.mimetype.startsWith('video/') ? 'video' : 'image';
    const folder = this.buildUploadFolder(authorId);

    const upload = await this.cloudinary.uploadBuffer({
      buffer: file.buffer,
      folder,
      resourceType,
      overwrite: false,
    });

    return {
      folder,
      url: upload.url,
      secureUrl: upload.secureUrl,
      publicId: upload.publicId,
      resourceType: upload.resourceType,
      bytes: upload.bytes,
      format: upload.format,
      width: upload.width,
      height: upload.height,
      duration: upload.duration,
    };
  }
}
