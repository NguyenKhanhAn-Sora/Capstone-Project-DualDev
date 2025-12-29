import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class CommentLike extends Document {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Comment',
    index: true,
    required: true,
  })
  commentId: Types.ObjectId;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    index: true,
    required: true,
  })
  userId: Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  createdAt?: Date;
}

export const CommentLikeSchema = SchemaFactory.createForClass(CommentLike);
CommentLikeSchema.index({ commentId: 1, userId: 1 }, { unique: true });
