import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Ignored extends Document {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    required: true,
  })
  userId: mongoose.Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    required: true,
  })
  ignoredUserId: mongoose.Types.ObjectId;
}

export const IgnoredSchema = SchemaFactory.createForClass(Ignored);
IgnoredSchema.index({ userId: 1, ignoredUserId: 1 }, { unique: true });
IgnoredSchema.index({ ignoredUserId: 1 });
