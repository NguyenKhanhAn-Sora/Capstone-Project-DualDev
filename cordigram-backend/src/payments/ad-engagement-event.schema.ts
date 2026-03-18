import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AdEngagementEventType = 'impression' | 'dwell' | 'cta_click';

@Schema({ timestamps: true })
export class AdEngagementEvent extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Post', required: true, index: true })
  promotedPostId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Post', default: null, index: true })
  renderedPostId?: Types.ObjectId | null;

  @Prop({ type: String, enum: ['impression', 'dwell', 'cta_click'], required: true, index: true })
  eventType: AdEngagementEventType;

  @Prop({ type: String, required: true, trim: true, index: true })
  sessionId: string;

  @Prop({ type: Number, default: null })
  durationMs?: number | null;

  @Prop({ type: String, default: 'home_feed', trim: true })
  source?: string;

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const AdEngagementEventSchema = SchemaFactory.createForClass(AdEngagementEvent);

AdEngagementEventSchema.index({ promotedPostId: 1, eventType: 1, createdAt: -1 });
AdEngagementEventSchema.index({ userId: 1, promotedPostId: 1, createdAt: -1 });
AdEngagementEventSchema.index(
  { userId: 1, promotedPostId: 1, sessionId: 1, eventType: 1 },
  {
    unique: true,
    partialFilterExpression: {
      eventType: { $eq: 'impression' },
    },
  },
);