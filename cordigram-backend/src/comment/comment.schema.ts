import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

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

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);

CommentSchema.index({ postId: 1, createdAt: -1 });
CommentSchema.index({ postId: 1, parentId: 1, createdAt: 1 });
