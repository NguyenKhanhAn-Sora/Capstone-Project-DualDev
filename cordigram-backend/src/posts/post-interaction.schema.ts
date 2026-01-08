import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type InteractionType =
  | 'like'
  | 'comment'
  | 'share'
  | 'save'
  | 'view'
  | 'impression'
  | 'hide'
  | 'report'
  | 'repost';

@Schema({ timestamps: true })
export class PostInteraction extends Document {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    required: true,
  })
  userId: mongoose.Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    index: true,
    required: true,
  })
  postId: mongoose.Types.ObjectId;

  @Prop({
    type: String,
    enum: [
      'like',
      'comment',
      'share',
      'save',
      'view',
      'impression',
      'hide',
      'report',
      'repost',
    ],
    index: true,
    required: true,
  })
  type: InteractionType;

  @Prop({ type: Number, default: null })
  durationMs?: number | null;

  @Prop({ type: Object, default: null })
  metadata?: Record<string, unknown> | null;
}

export const PostInteractionSchema =
  SchemaFactory.createForClass(PostInteraction);
PostInteractionSchema.index(
  { userId: 1, postId: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: {
        $in: ['like', 'comment', 'share', 'save', 'hide', 'report', 'repost'],
      },
    },
  },
);
PostInteractionSchema.index({ postId: 1, createdAt: -1 });
PostInteractionSchema.index({ userId: 1, createdAt: -1 });
