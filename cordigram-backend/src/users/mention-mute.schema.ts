import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

/**
 * Người dùng tắt thông báo khi bị @ bởi một sender cụ thể (đến hạn until).
 */
@Schema({ timestamps: true })
export class MentionMute extends Document {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  ownerUserId: mongoose.Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  mutedSenderId: mongoose.Types.ObjectId;

  /** Sau thời điểm này coi như hết mute (hoặc rất xa = “cho đến khi bật lại”). */
  @Prop({ type: Date, required: true })
  until: Date;
}

export const MentionMuteSchema = SchemaFactory.createForClass(MentionMute);
MentionMuteSchema.index(
  { ownerUserId: 1, mutedSenderId: 1 },
  { unique: true },
);
