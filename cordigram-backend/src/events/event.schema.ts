import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EventFrequency =
  | 'none'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'yearly';

export type EventLocationType = 'voice' | 'other';

export type EventStatus = 'scheduled' | 'live' | 'ended';

@Schema({ timestamps: true })
export class ServerEvent extends Document {
  @Prop({ type: String, enum: ['scheduled', 'live', 'ended'], default: 'scheduled' })
  status: EventStatus;
  @Prop({ type: Types.ObjectId, ref: 'Server', required: true })
  serverId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Channel', default: null })
  channelId: Types.ObjectId | null;

  @Prop({ type: String, enum: ['voice', 'other'], required: true })
  locationType: EventLocationType;

  @Prop({ required: true, trim: true })
  topic: string;

  @Prop({ required: true })
  startAt: Date;

  @Prop({ required: true })
  endAt: Date;

  @Prop({
    type: String,
    enum: ['none', 'weekly', 'biweekly', 'monthly', 'yearly'],
    default: 'none',
  })
  frequency: EventFrequency;

  @Prop({ type: String, default: null })
  description: string | null;

  @Prop({ type: String, default: null })
  coverImageUrl: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: String, default: null })
  inviteCode: string | null;

  @Prop({ type: Date, default: null })
  inviteExpiresAt: Date | null;
}

export const ServerEventSchema = SchemaFactory.createForClass(ServerEvent);
ServerEventSchema.index({ serverId: 1, startAt: 1 });
ServerEventSchema.index({ inviteCode: 1 }, { sparse: true });
