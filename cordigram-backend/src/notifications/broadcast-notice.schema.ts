import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SystemNoticeLevel = 'info' | 'warning' | 'critical';
export type BroadcastTargetMode = 'all' | 'include' | 'exclude';

@Schema({ timestamps: true })
export class BroadcastNotice extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  adminId: Types.ObjectId;

  @Prop({ type: String, trim: true, maxlength: 120, default: null })
  title?: string | null;

  @Prop({ type: String, required: true, trim: true, maxlength: 2000 })
  body: string;

  @Prop({
    type: String,
    enum: ['info', 'warning', 'critical'],
    default: 'info',
  })
  level: SystemNoticeLevel;

  @Prop({ type: String, default: null, maxlength: 300 })
  actionUrl?: string | null;

  @Prop({ type: String, enum: ['all', 'include', 'exclude'], default: 'all' })
  targetMode: BroadcastTargetMode;

  @Prop({ type: Number, required: true, default: 0 })
  includeCount: number;

  @Prop({ type: Number, required: true, default: 0 })
  excludeCount: number;

  @Prop({ type: Number, required: true, default: 0 })
  targetUserCount: number;

  @Prop({ type: Number, required: true, default: 0 })
  realtimeDeliveredCount: number;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const BroadcastNoticeSchema =
  SchemaFactory.createForClass(BroadcastNotice);
BroadcastNoticeSchema.index({ createdAt: -1 });
