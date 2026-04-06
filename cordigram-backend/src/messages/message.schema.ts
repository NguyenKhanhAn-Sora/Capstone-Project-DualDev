import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChannelMessageType =
  | 'text'
  | 'gif'
  | 'sticker'
  | 'voice'
  | 'system'
  | 'welcome';

@Schema({ timestamps: true })
export class Message extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Channel', required: true })
  channelId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  senderId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  content: string;

  @Prop({
    type: String,
    enum: ['text', 'gif', 'sticker', 'voice', 'system', 'welcome'],
    default: 'text',
  })
  messageType: ChannelMessageType;

  @Prop({ type: String, default: null })
  giphyId: string | null;

  @Prop({ type: String, default: null })
  voiceUrl: string | null;

  @Prop({ type: Number, default: null })
  voiceDuration: number | null;

  @Prop({ type: [String], default: [] })
  attachments: string[];

  @Prop({
    type: [
      {
        userId: { type: Types.ObjectId, ref: 'User' },
        emoji: { type: String },
      },
    ],
    default: [],
  })
  reactions: Array<{
    userId: Types.ObjectId;
    emoji: string;
  }>;

  @Prop({ type: Boolean, default: false })
  isEdited: boolean;

  @Prop({ type: Date, default: null })
  editedAt: Date | null;

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Message', default: null })
  replyTo: Types.ObjectId | null;

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  mentions: Types.ObjectId[];
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ channelId: 1 });
MessageSchema.index({ senderId: 1 });
MessageSchema.index({ createdAt: -1 });
MessageSchema.index({ content: 'text' });
MessageSchema.index({ mentions: 1, createdAt: -1 });
