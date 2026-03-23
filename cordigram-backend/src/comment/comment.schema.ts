import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type CommentModerationState =
  | 'normal'
  | 'restricted'
  | 'hidden'
  | 'removed';

@Schema({ _id: false })
export class CommentLinkPreview {
  @Prop({ type: String, required: true, trim: true })
  url: string;

  @Prop({ type: String, required: true, trim: true })
  canonicalUrl: string;

  @Prop({ type: String, required: true, trim: true })
  domain: string;

  @Prop({ type: String, default: null, trim: true })
  siteName?: string | null;

  @Prop({ type: String, default: null, trim: true })
  title?: string | null;

  @Prop({ type: String, default: null, trim: true })
  description?: string | null;

  @Prop({ type: String, default: null, trim: true })
  image?: string | null;

  @Prop({ type: String, default: null, trim: true })
  favicon?: string | null;
}

@Schema({ _id: false })
export class CommentMedia {
  @Prop({ type: String, enum: ['image', 'video'], required: true })
  type: 'image' | 'video';

  @Prop({ type: String, required: true, trim: true })
  url: string;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  metadata?: Record<string, unknown> | null;
}

const CommentMediaSchema = SchemaFactory.createForClass(CommentMedia);
const CommentLinkPreviewSchema = SchemaFactory.createForClass(CommentLinkPreview);

@Schema({ timestamps: true })
export class Comment extends Document {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Post',
    index: true,
    required: true,
  })
  postId: Types.ObjectId;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    index: true,
    required: true,
  })
  authorId: Types.ObjectId;

  @Prop({ type: String, trim: true, default: '', maxlength: 1000 })
  content: string;

  @Prop({ type: CommentMediaSchema, default: null })
  media?: CommentMedia | null;

  @Prop({ type: [CommentLinkPreviewSchema], default: [] })
  linkPreviews?: CommentLinkPreview[];

  @Prop({
    type: [
      {
        userId: { type: SchemaTypes.ObjectId, ref: 'User' },
        username: { type: String },
      },
    ],
    default: [],
  })
  mentions?: Array<{ userId?: Types.ObjectId; username?: string }>;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Comment',
    default: null,
    index: true,
  })
  parentId?: Types.ObjectId | null;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Comment',
    default: null,
    index: true,
  })
  rootCommentId?: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;

  @Prop({ type: Boolean, default: false, index: true })
  autoHiddenPendingReview?: boolean;

  @Prop({ type: Date, default: null })
  autoHiddenAt?: Date | null;

  @Prop({ type: Date, default: null, index: true })
  autoHiddenUntil?: Date | null;

  @Prop({ type: Date, default: null, index: true })
  autoHiddenEscalatedAt?: Date | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', default: null })
  deletedBy?: Types.ObjectId | null;

  @Prop({ type: String, enum: ['user', 'admin', 'system'], default: null })
  deletedSource?: 'user' | 'admin' | 'system' | null;

  @Prop({ type: String, trim: true, maxlength: 500, default: null })
  deletedReason?: string | null;

  @Prop({
    type: String,
    enum: ['normal', 'restricted', 'hidden', 'removed'],
    default: 'normal',
    index: true,
  })
  moderationState?: CommentModerationState;

  @Prop({ type: Date, default: null, index: true })
  pinnedAt?: Date | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', default: null })
  pinnedBy?: Types.ObjectId | null;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);

CommentSchema.index({ postId: 1, createdAt: -1 });
CommentSchema.index({ postId: 1, parentId: 1, createdAt: 1 });
CommentSchema.index({ postId: 1, pinnedAt: -1, createdAt: 1 });
CommentSchema.index({
  postId: 1,
  parentId: 1,
  deletedAt: 1,
  moderationState: 1,
  createdAt: 1,
});
CommentSchema.index({
  postId: 1,
  deletedAt: 1,
  moderationState: 1,
  createdAt: -1,
});
