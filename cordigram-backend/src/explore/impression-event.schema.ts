import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

@Schema({ timestamps: true })
export class PostImpressionEvent extends Document {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    required: true,
  })
  userId: mongoose.Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    index: true,
    required: true,
  })
  postId: mongoose.Types.ObjectId;

  @Prop({ type: String, default: 'explore' })
  source: string;

  @Prop({ type: String, required: true })
  sessionId: string;

  @Prop({ type: Number, default: null })
  position?: number | null;
}

export const PostImpressionEventSchema =
  SchemaFactory.createForClass(PostImpressionEvent);

PostImpressionEventSchema.index(
  { userId: 1, postId: 1, sessionId: 1 },
  { unique: true },
);
PostImpressionEventSchema.index({ userId: 1, createdAt: -1 });
PostImpressionEventSchema.index({ postId: 1, createdAt: -1 });
