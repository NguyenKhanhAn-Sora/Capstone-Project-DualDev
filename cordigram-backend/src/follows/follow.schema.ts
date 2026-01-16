import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Follow extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  followerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  followeeId: Types.ObjectId;
}

export const FollowSchema = SchemaFactory.createForClass(Follow);
FollowSchema.index({ followerId: 1, followeeId: 1 }, { unique: true });

