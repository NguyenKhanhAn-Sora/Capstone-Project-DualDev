import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PollDocument = Poll & Document;

@Schema({ timestamps: true })
export class Poll {
  _id?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  creatorId: Types.ObjectId;

  @Prop({ required: true, maxlength: 300 })
  question: string;

  @Prop({ type: [String], required: true })
  options: string[];

  @Prop({ type: Number, required: true, default: 24 })
  durationHours: number;

  @Prop({ type: Boolean, default: false })
  allowMultipleAnswers: boolean;

  @Prop({ type: Date, required: true })
  expiresAt: Date;

  @Prop({
    type: [
      {
        userId: { type: Types.ObjectId, ref: 'User' },
        optionIndex: Number,
        votedAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  votes: Array<{
    userId: Types.ObjectId;
    optionIndex: number;
    votedAt: Date;
  }>;

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PollSchema = SchemaFactory.createForClass(Poll);

// Add indexes for better query performance
PollSchema.index({ creatorId: 1, createdAt: -1 });
PollSchema.index({ expiresAt: 1 });
PollSchema.index({ 'votes.userId': 1 });
