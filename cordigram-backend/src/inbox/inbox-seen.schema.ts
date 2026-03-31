import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class InboxSeen extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, required: true, index: true })
  sourceType: string; // 'event' | 'server_invite'

  @Prop({ type: String, required: true, index: true })
  sourceId: string;

  @Prop({ type: Date, default: Date.now })
  seenAt: Date;
}

export const InboxSeenSchema = SchemaFactory.createForClass(InboxSeen);
InboxSeenSchema.index(
  { userId: 1, sourceType: 1, sourceId: 1 },
  { unique: true },
);
