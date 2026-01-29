import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Comment extends Document {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Post',
    index: true,
    required: true,
  })
  postId: Types.ObjectId;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    index: true,
    required: true,
  })
  authorId: Types.ObjectId;

  @Prop({ type: String, trim: true, required: true, maxlength: 1000 })
  content: string;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Comment',
    default: null,
    index: true,
  })
  parentId?: Types.ObjectId | null;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Comment',
    default: null,
    index: true,
  })
  rootCommentId?: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);

CommentSchema.index({ postId: 1, createdAt: -1 });
CommentSchema.index({ postId: 1, parentId: 1, createdAt: 1 });
