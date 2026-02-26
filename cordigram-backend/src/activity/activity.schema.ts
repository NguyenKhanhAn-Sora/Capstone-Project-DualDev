import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Types } from 'mongoose';

export type ActivityType =
  | 'post_like'
  | 'comment_like'
  | 'comment'
  | 'repost'
  | 'save'
  | 'follow'
  | 'report_post'
  | 'report_user';

export type ActivityMeta = {
  postCaption?: string | null;
  postMediaUrl?: string | null;
  postAuthorId?: string | null;
  postAuthorDisplayName?: string | null;
  postAuthorUsername?: string | null;
  postAuthorAvatarUrl?: string | null;
  commentSnippet?: string | null;
  targetDisplayName?: string | null;
  targetUsername?: string | null;
  targetAvatarUrl?: string | null;
  reportCategory?: string | null;
  reportReason?: string | null;
};

@Schema({ timestamps: true })
export class ActivityLog extends Document {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    required: true,
  })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: [
      'post_like',
      'comment_like',
      'comment',
      'repost',
      'save',
      'follow',
      'report_post',
      'report_user',
    ],
    index: true,
    required: true,
  })
  type: ActivityType;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    index: true,
    default: null,
  })
  postId?: Types.ObjectId | null;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    index: true,
    default: null,
  })
  commentId?: Types.ObjectId | null;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    default: null,
  })
  targetUserId?: Types.ObjectId | null;

  @Prop({ type: String, enum: ['post', 'reel'], default: null })
  postKind?: 'post' | 'reel' | null;

  @Prop({ type: Object, default: null })
  meta?: ActivityMeta | null;

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const ActivityLogSchema = SchemaFactory.createForClass(ActivityLog);
ActivityLogSchema.index({ userId: 1, createdAt: -1, _id: -1 });
ActivityLogSchema.index({ userId: 1, type: 1, createdAt: -1, _id: -1 });
