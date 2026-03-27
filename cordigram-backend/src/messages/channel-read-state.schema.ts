import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Lưu trạng thái đã đọc tin nhắn kênh theo từng user.
 * lastReadAt: thời điểm user xem kênh lần cuối; mọi tin nhắn có createdAt > lastReadAt được coi là chưa đọc.
 */
@Schema({ timestamps: true })
export class ChannelReadState extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Channel', required: true })
  channelId: Types.ObjectId;

  @Prop({ type: Date, required: true, default: () => new Date() })
  lastReadAt: Date;
}

export const ChannelReadStateSchema =
  SchemaFactory.createForClass(ChannelReadState);

ChannelReadStateSchema.index({ userId: 1, channelId: 1 }, { unique: true });
ChannelReadStateSchema.index({ channelId: 1 });
