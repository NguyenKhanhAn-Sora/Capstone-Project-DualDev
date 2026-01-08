import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Otp extends Document {
  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  codeHash: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: false })
  consumed: boolean;

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ default: 0 })
  sentCount: number;

  @Prop({ type: Date, default: null })
  lastSentAt: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const OtpSchema = SchemaFactory.createForClass(Otp);
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
OtpSchema.index({ email: 1, createdAt: -1 });
