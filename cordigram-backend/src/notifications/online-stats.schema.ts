import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class OnlineStats extends Document {
  @Prop({ type: String, required: true, unique: true, default: 'global' })
  key: string;

  @Prop({ type: Number, default: 0 })
  peakOnlineUsers: number;

  @Prop({ type: Number, default: 0 })
  lastOnlineUsers: number;
}

export const OnlineStatsSchema = SchemaFactory.createForClass(OnlineStats);
