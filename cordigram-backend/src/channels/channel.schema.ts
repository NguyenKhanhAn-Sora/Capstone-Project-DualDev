import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChannelType = 'text' | 'voice';

@Schema({ timestamps: true })
export class Channel extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, enum: ['text', 'voice'], required: true })
  type: ChannelType;

  @Prop({ type: String, default: null })
  description: string | null;

  @Prop({ type: Types.ObjectId, ref: 'Server', required: true })
  serverId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Boolean, default: false })
  isDefault: boolean;

  @Prop({
    type: [
      {
        userId: { type: Types.ObjectId, ref: 'User' },
        permissions: { type: String, default: 'read' }, // read, write, moderate
      },
    ],
    default: [],
  })
  permissions: Array<{
    userId: Types.ObjectId;
    permissions: string;
  }>;

  @Prop({ type: Number, default: 0 })
  messageCount: number;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const ChannelSchema = SchemaFactory.createForClass(Channel);
ChannelSchema.index({ serverId: 1 });
ChannelSchema.index({ serverId: 1, type: 1 });
