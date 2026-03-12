import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Types } from 'mongoose';

import type { PostKind } from '../posts/post.schema';

export type NotificationType =
  | 'post_like'
  | 'comment_like'
  | 'comment_reply'
  | 'post_comment'
  | 'post_mention'
  | 'follow'
  | 'login_alert'
  | 'post_moderation'
  | 'report'
  | 'system_notice';

export type ReportNotificationOutcome = 'no_violation' | 'action_taken';
export type ReportNotificationAudience = 'reporter' | 'offender';
export type ReportNotificationTargetType = 'post' | 'comment' | 'user';
export type ReportNotificationSeverity = 'low' | 'medium' | 'high';

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

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    index: true,
    default: null,
  })
  commentId: Types.ObjectId | null;

  @Prop({ type: String, enum: ['post', 'reel'], default: 'post' })
  postKind: PostKind;

  @Prop({
    type: String,
    enum: [
      'post_like',
      'comment_like',
      'comment_reply',
      'post_comment',
      'post_mention',
      'follow',
      'login_alert',
      'post_moderation',
      'report',
      'system_notice',
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

  @Prop({ type: String, enum: ['no_violation', 'action_taken'], default: null })
  reportOutcome?: ReportNotificationOutcome | null;

  @Prop({ type: String, enum: ['reporter', 'offender'], default: null })
  reportAudience?: ReportNotificationAudience | null;

  @Prop({ type: String, enum: ['post', 'comment', 'user'], default: null })
  reportTargetType?: ReportNotificationTargetType | null;

  @Prop({ type: String, default: null })
  reportAction?: string | null;

  @Prop({ type: String, default: null })
  reportTargetId?: string | null;

  @Prop({ type: String, enum: ['low', 'medium', 'high'], default: null })
  reportSeverity?: ReportNotificationSeverity | null;

  @Prop({ type: Number, default: null })
  reportStrikeDelta?: number | null;

  @Prop({ type: Number, default: null })
  reportStrikeTotal?: number | null;

  @Prop({ type: String, default: null })
  reportReason?: string | null;

  @Prop({ type: Date, default: null })
  reportActionExpiresAt?: Date | null;

  @Prop({ type: String, enum: ['approve', 'blur', 'reject'], default: null })
  moderationDecision?: 'approve' | 'blur' | 'reject' | null;

  @Prop({ type: [String], default: [] })
  moderationReasons?: string[];

  @Prop({ type: String, default: null })
  systemNoticeTitle?: string | null;

  @Prop({ type: String, default: null })
  systemNoticeBody?: string | null;

  @Prop({ type: String, enum: ['info', 'warning', 'critical'], default: null })
  systemNoticeLevel?: 'info' | 'warning' | 'critical' | null;

  @Prop({ type: String, default: null })
  systemNoticeActionUrl?: string | null;

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
  { recipientId: 1, postId: 1, commentId: 1, type: 1 },
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
