import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ModerationTargetType = 'post' | 'comment' | 'user';
export type ModerationActionType =
  | 'no_violation'
  | 'remove_post'
  | 'restrict_post'
  | 'delete_comment'
  | 'warn'
  | 'mute_interaction'
  | 'suspend_user'
  | 'limit_account'
  | 'violation';
export type ModerationSeverity = 'low' | 'medium' | 'high';

@Schema({ timestamps: true })
export class ModerationAction extends Document {
  @Prop({ type: String, enum: ['post', 'comment', 'user'], required: true })
  targetType: ModerationTargetType;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  targetId: Types.ObjectId;

  @Prop({
    type: String,
    enum: [
      'no_violation',
      'remove_post',
      'restrict_post',
      'delete_comment',
      'warn',
      'mute_interaction',
      'suspend_user',
      'limit_account',
      'violation',
    ],
    required: true,
  })
  action: ModerationActionType;

  @Prop({ type: Date, default: null })
  expiresAt?: Date | null;

  @Prop({ type: String, required: true })
  category: string;

  @Prop({ type: String, required: true })
  reason: string;

  @Prop({ type: String, enum: ['low', 'medium', 'high'], default: null })
  severity?: ModerationSeverity | null;

  @Prop({ type: String, trim: true, maxlength: 500, default: null })
  note?: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  moderatorId: Types.ObjectId;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const ModerationActionSchema =
  SchemaFactory.createForClass(ModerationAction);
ModerationActionSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
