import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ServerInviteStatus = 'pending' | 'accepted' | 'declined';

@Schema({ timestamps: true })
export class ServerInvite extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  fromUserId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  toUserId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Server', required: true, index: true })
  serverId: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['pending', 'accepted', 'declined'],
    default: 'pending',
    index: true,
  })
  status: ServerInviteStatus;

  @Prop({ type: Date, default: null })
  respondedAt: Date | null;
}

export const ServerInviteSchema = SchemaFactory.createForClass(ServerInvite);

ServerInviteSchema.index(
  { fromUserId: 1, toUserId: 1, serverId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } },
);

