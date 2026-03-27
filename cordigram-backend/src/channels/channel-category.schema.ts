import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class ChannelCategory extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: Types.ObjectId, ref: 'Server', required: true })
  serverId: Types.ObjectId;

  @Prop({ type: Number, default: 0 })
  position: number;

  @Prop({ type: String, enum: ['text', 'voice', 'mixed'], default: 'mixed' })
  type: 'text' | 'voice' | 'mixed';
}

export const ChannelCategorySchema =
  SchemaFactory.createForClass(ChannelCategory);
ChannelCategorySchema.index({ serverId: 1, position: 1 });
