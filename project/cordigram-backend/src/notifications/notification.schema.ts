import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Types } from 'mongoose';

export type NotificationType = 'post_like' | 'post_comment';
import type { PostKind } from '../posts/post.schema';

@Schema({ timestamps: true })
export class Notification extends Document {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    required: true,
  })
  recipientId: Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    required: true,
  })
  actorId: Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    index: true,
    default: null,
  })
  postId: Types.ObjectId | null;

  @Prop({ type: String, enum: ['post', 'reel'], default: 'post' })
  postKind: PostKind;

  @Prop({
    type: String,
    enum: ['post_like', 'post_comment'],
    index: true,
    required: true,
  })
  type: NotificationType;

  @Prop({ type: Number, default: 0 })
  likeCount: number;

  @Prop({ type: Number, default: 0 })
  commentCount: number;

  @Prop({ type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] })
  commentActorIds: Types.ObjectId[];

  @Prop({ type: Date, default: null })
  readAt: Date | null;

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ recipientId: 1, createdAt: -1 });
NotificationSchema.index({ recipientId: 1, readAt: 1 });
NotificationSchema.index(
  { recipientId: 1, postId: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { postId: { $ne: null } },
  },
);
