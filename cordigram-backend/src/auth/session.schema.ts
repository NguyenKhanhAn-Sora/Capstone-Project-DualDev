import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Session extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', index: true, required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, index: true })
  tokenHash: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: '' })
  userAgent: string;

  @Prop({ default: '' })
  deviceInfo: string;

  @Prop({ default: '' })
  deviceIdHash: string;

  @Prop({ default: '' })
  deviceType: string;

  @Prop({ default: '' })
  os: string;

  @Prop({ default: '' })
  browser: string;

  @Prop({ default: '' })
  ip: string;

  @Prop({ default: '' })
  location: string;

  @Prop({ default: '' })
  loginMethod: string;

  @Prop({ type: Date, default: null })
  lastSeenAt: Date | null;
}

export const SessionSchema = SchemaFactory.createForClass(Session);
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
