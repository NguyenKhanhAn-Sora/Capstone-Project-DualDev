import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

@Schema({ timestamps: true })
export class UserTasteProfile extends Document {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  userId: mongoose.Types.ObjectId;

  @Prop({ type: Map, of: Number, default: {} })
  hashtagWeights: Map<string, number>;

  @Prop({ type: Map, of: Number, default: {} })
  topicWeights: Map<string, number>;

  @Prop({ type: Map, of: Number, default: {} })
  authorWeights: Map<string, number>;

  @Prop({ type: Map, of: Number, default: {} })
  kindWeights: Map<string, number>;

  @Prop({ type: Number, default: 3 })
  version: number;

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const UserTasteProfileSchema =
  SchemaFactory.createForClass(UserTasteProfile);

UserTasteProfileSchema.index({ userId: 1 }, { unique: true });
UserTasteProfileSchema.index({ updatedAt: -1 });
