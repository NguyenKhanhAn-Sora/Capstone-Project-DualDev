import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type Visibility = 'public' | 'followers' | 'private';
export type PostStatus = 'published' | 'scheduled';
export type PostKind = 'post' | 'reel';

@Schema({ _id: false })
export class Media {
  @Prop({ type: String, enum: ['image', 'video'], required: true })
  type: 'image' | 'video';

  @Prop({ type: String, required: true, trim: true })
  url: string;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  metadata?: Record<string, unknown> | null;
}

const MediaSchema = SchemaFactory.createForClass(Media);

export type PostStats = {
  hearts: number;
  comments: number;
  saves: number;
  reposts: number;
};

@Schema({ timestamps: true })
export class Post extends Document {
  @Prop({ type: String, enum: ['post', 'reel'], default: 'post', index: true })
  kind: PostKind;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  authorId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Server', default: null })
  serverId?: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Channel', default: null })
  channelId?: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Post', default: null })
  repostOf?: Types.ObjectId | null;

  @Prop({ type: String, trim: false, maxlength: 2200, default: '' })
  content: string;

  @Prop({ type: [MediaSchema], default: [] })
  media: Media[];

  @Prop({ type: Number, default: null })
  videoDurationSec?: number | null;

  @Prop({
    type: [String],
    default: [],
    set: (val: string[]) =>
      Array.from(
        new Set(
          (val ?? [])
            .map((tag) =>
              tag?.toString().trim().replace(/^#/, '').toLowerCase(),
            )
            .filter(Boolean),
        ),
      ).slice(0, 30),
  })
  hashtags: string[];

  @Prop({
    type: [String],
    default: [],
    set: (val: string[]) =>
      Array.from(
        new Set(
          (val ?? [])
            .map((m) => m?.toString().trim().replace(/^@/, '').toLowerCase())
            .filter(Boolean),
        ),
      ).slice(0, 30),
  })
  mentions: string[];

  @Prop({ type: String, trim: true, maxlength: 160, default: null })
  location?: string | null;

  @Prop({
    type: String,
    enum: ['public', 'followers', 'private'],
    default: 'public',
  })
  visibility: Visibility;

  @Prop({ type: Boolean, default: true })
  allowComments: boolean;

  @Prop({ type: Boolean, default: false })
  allowDownload: boolean;

  @Prop({
    type: String,
    enum: ['published', 'scheduled'],
    default: 'published',
  })
  status: PostStatus;

  @Prop({ type: Date, default: null })
  scheduledAt?: Date | null;

  @Prop({ type: Date, default: null })
  publishedAt?: Date | null;

  @Prop({
    type: {
      hearts: { type: Number, default: 0 },
      comments: { type: Number, default: 0 },
      saves: { type: Number, default: 0 },
      reposts: { type: Number, default: 0 },
    },
    default: { hearts: 0, comments: 0, saves: 0, reposts: 0 },
  })
  stats: PostStats;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const PostSchema = SchemaFactory.createForClass(Post);

PostSchema.index({ authorId: 1, createdAt: -1 });
PostSchema.index({ hashtags: 1 });
PostSchema.index({ mentions: 1 });
PostSchema.index({ repostOf: 1 });
PostSchema.index({ visibility: 1, createdAt: -1 });
PostSchema.index({ kind: 1, createdAt: -1 });
