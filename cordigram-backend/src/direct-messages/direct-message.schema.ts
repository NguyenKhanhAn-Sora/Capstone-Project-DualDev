import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MessageType = 'text' | 'gif' | 'sticker' | 'voice' | 'call';

export type CallMediaType = 'audio' | 'video';

export type CallLogStatus = 'missed' | 'completed' | 'declined' | 'cancelled';

@Schema({ timestamps: true })
export class DirectMessage extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  senderId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  receiverId: Types.ObjectId;

  @Prop({ type: String, required: true })
  content: string;

  @Prop({
    type: String,
    enum: ['text', 'gif', 'sticker', 'voice', 'call'],
    default: 'text',
  })
  type: MessageType;

  /** audio | video — only when type === 'call' */
  @Prop({ type: String, enum: ['audio', 'video'], default: null })
  callType: CallMediaType | null;

  /** missed | completed | declined | cancelled — only when type === 'call' */
  @Prop({
    type: String,
    enum: ['missed', 'completed', 'declined', 'cancelled'],
    default: null,
  })
  callStatus: CallLogStatus | null;

  /** Seconds connected — only when callStatus === 'completed' */
  @Prop({ type: Number, default: null })
  callDuration: number | null;

  /** User who started the call — only when type === 'call' */
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  callInitiatorId: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  giphyId: string | null;

  @Prop({ type: String, default: null })
  customStickerUrl: string | null;

  @Prop({ type: Types.ObjectId, default: null })
  serverStickerId: Types.ObjectId | null;

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

  @Prop({ type: Types.ObjectId, ref: 'DirectMessage', default: null })
  replyTo: Types.ObjectId | null;

  @Prop({ type: Boolean, default: false })
  isPinned: boolean;

  @Prop({ type: Date, default: null })
  pinnedAt: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  pinnedBy: Types.ObjectId | null;

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

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;

  @Prop({ type: [Types.ObjectId], default: [] })
  deletedFor: Types.ObjectId[];

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

export const DirectMessageSchema = SchemaFactory.createForClass(DirectMessage);

DirectMessageSchema.index({ senderId: 1, receiverId: 1 });
DirectMessageSchema.index({ receiverId: 1, isRead: 1 });
DirectMessageSchema.index({ createdAt: -1 });
DirectMessageSchema.index({ content: 'text' });
