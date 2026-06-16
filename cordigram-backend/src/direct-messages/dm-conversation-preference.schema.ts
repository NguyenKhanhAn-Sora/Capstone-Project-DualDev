import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const DM_CONVERSATION_CATEGORIES = [
  'customer',
  'family',
  'work',
  'friends',
  'reply_later',
  'colleague',
] as const;

export type DmConversationCategory =
  (typeof DM_CONVERSATION_CATEGORIES)[number];

@Schema({ timestamps: true })
export class DmConversationPreference extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  peerUserId: Types.ObjectId;

  @Prop({ type: Date, default: null })
  mutedUntil: Date | null;

  @Prop({ type: Boolean, default: false })
  mutedForever: boolean;

  @Prop({ type: String, default: null })
  category: DmConversationCategory | null;
}

export const DmConversationPreferenceSchema = SchemaFactory.createForClass(
  DmConversationPreference,
);
DmConversationPreferenceSchema.index(
  { userId: 1, peerUserId: 1 },
  { unique: true },
);
