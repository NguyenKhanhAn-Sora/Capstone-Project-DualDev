import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Types } from 'mongoose';

import type { PostKind } from '../posts/post.schema';

export type NotificationType =
  | 'post_like'
  | 'post_comment'
  | 'post_mention'
  | 'follow'
  | 'login_alert';

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
    enum: [
      'post_like',
      'post_comment',
      'post_mention',
      'follow',
      'login_alert',
    ],
    index: true,
    required: true,
  })
  type: NotificationType;

  @Prop({ type: String, default: '' })
  deviceInfo?: string;

  @Prop({ type: String, default: '' })
  deviceType?: string;

  @Prop({ type: String, default: '' })
  os?: string;

  @Prop({ type: String, default: '' })
  browser?: string;

  @Prop({ type: String, default: '' })
  location?: string;

  @Prop({ type: String, default: '' })
  ip?: string;

  @Prop({ type: String, default: '' })
  deviceIdHash?: string;

  @Prop({ type: Date, default: null })
  loginAt?: Date | null;

  @Prop({ type: Number, default: 0 })
  likeCount: number;

  @Prop({ type: Number, default: 0 })
  commentCount: number;

  @Prop({ type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] })
  commentActorIds: Types.ObjectId[];

  @Prop({ type: Number, default: 0 })
  mentionCount: number;

  @Prop({ type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] })
  mentionActorIds: Types.ObjectId[];

  @Prop({ type: String, enum: ['post', 'comment'], default: 'post' })
  mentionSource: 'post' | 'comment';

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
NotificationSchema.index(
  { recipientId: 1, actorId: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { postId: null, type: 'follow' },
  },
);
