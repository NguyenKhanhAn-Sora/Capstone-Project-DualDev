import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LivestreamStatus = 'live' | 'ended';

@Schema({ timestamps: true })
export class Livestream extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  hostUserId: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, maxlength: 120 })
  hostName: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 2200 })
  title: string;

  @Prop({ type: String, default: '', trim: true, maxlength: 500 })
  description: string;

  @Prop({ type: String, default: '', trim: true, maxlength: 180 })
  pinnedComment: string;

  @Prop({ type: String, default: '', trim: true, maxlength: 160 })
  location: string;

  @Prop({ type: [String], default: [] })
  mentionUsernames: string[];

  @Prop({
    type: String,
    enum: ['public', 'followers', 'private'],
    default: 'public',
    index: true,
  })
  visibility: 'public' | 'followers' | 'private';

  @Prop({
    type: String,
    enum: ['adaptive', 'balanced', 'low'],
    default: 'adaptive',
  })
  latencyMode: 'adaptive' | 'balanced' | 'low';

  @Prop({ type: String, required: true, unique: true, index: true })
  roomName: string;

  @Prop({
    type: String,
    enum: ['livekit', 'ivs'],
    default: 'livekit',
    index: true,
  })
  provider: 'livekit' | 'ivs';

  @Prop({ type: String, default: '', trim: true })
  ivsChannelArn: string;

  @Prop({ type: String, default: '', trim: true })
  ivsPlaybackUrl: string;

  @Prop({ type: String, default: '', trim: true })
  ivsIngestEndpoint: string;

  @Prop({ type: String, default: '', trim: true })
  ivsStreamKey: string;

  @Prop({ type: Number, default: 30 })
  maxViewers: number;

  @Prop({ type: String, enum: ['live', 'ended'], default: 'live', index: true })
  status: LivestreamStatus;

  @Prop({ type: Date, default: Date.now, index: true })
  startedAt: Date;

  @Prop({ type: Date, default: null })
  endedAt: Date | null;
}

export const LivestreamSchema = SchemaFactory.createForClass(Livestream);
LivestreamSchema.index({ status: 1, startedAt: -1 });
LivestreamSchema.index({ hostUserId: 1, status: 1 });
