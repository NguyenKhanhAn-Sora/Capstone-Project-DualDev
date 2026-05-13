import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'livestream_mutes', timestamps: false })
export class LivestreamMute extends Document {
  @Prop({ type: Types.ObjectId, required: true })
  hostId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  userId: Types.ObjectId;

  @Prop({ type: Date, required: true })
  expiresAt: Date;
}

export const LivestreamMuteSchema = SchemaFactory.createForClass(LivestreamMute);

LivestreamMuteSchema.index({ hostId: 1, userId: 1 }, { unique: true });
// TTL index — MongoDB auto-deletes documents when expiresAt is reached.
LivestreamMuteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
