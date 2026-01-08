import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChannelType = 'text' | 'voice';

export interface ServerMember {
  userId: Types.ObjectId;
  role: 'owner' | 'moderator' | 'member';
  joinedAt: Date;
}

@Schema({ timestamps: true })
export class Server extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, default: null })
  description: string | null;

  @Prop({ type: String, default: null })
  avatarUrl: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  ownerId: Types.ObjectId;

  @Prop({
    type: [
      {
        userId: { type: Types.ObjectId, ref: 'User' },
        role: { type: String, enum: ['owner', 'moderator', 'member'], default: 'member' },
        joinedAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  members: ServerMember[];

  @Prop({ type: [Types.ObjectId], ref: 'Channel', default: [] })
  channels: Types.ObjectId[];

  @Prop({ type: Number, default: 0 })
  memberCount: number;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const ServerSchema = SchemaFactory.createForClass(Server);
ServerSchema.index({ ownerId: 1 });
ServerSchema.index({ 'members.userId': 1 });
