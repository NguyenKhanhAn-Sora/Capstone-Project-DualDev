import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Hashtag extends Document {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  name: string;

  @Prop({ type: Number, default: 0 })
  usageCount: number;

  @Prop({ type: Date, default: null })
  lastUsedAt?: Date | null;
}

export const HashtagSchema = SchemaFactory.createForClass(Hashtag);
HashtagSchema.index({ name: 1 }, { unique: true });
HashtagSchema.index({ usageCount: -1, lastUsedAt: -1 });
