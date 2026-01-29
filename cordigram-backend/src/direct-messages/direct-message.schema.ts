import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MessageType = 'text' | 'gif' | 'sticker' | 'voice';

@Schema({ timestamps: true })
export class DirectMessage extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  senderId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  receiverId: Types.ObjectId;

  @Prop({ type: String, required: true })
  content: string;

  @Prop({ type: String, enum: ['text', 'gif', 'sticker', 'voice'], default: 'text' })
  type: MessageType;

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
        emoji: String,
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
  isRead: boolean;

  @Prop({ type: Date, default: null })
  readAt: Date | null;

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

export const DirectMessageSchema = SchemaFactory.createForClass(DirectMessage);

// Create indexes for faster queries
DirectMessageSchema.index({ senderId: 1, receiverId: 1 });
DirectMessageSchema.index({ receiverId: 1, isRead: 1 });
DirectMessageSchema.index({ createdAt: -1 });
