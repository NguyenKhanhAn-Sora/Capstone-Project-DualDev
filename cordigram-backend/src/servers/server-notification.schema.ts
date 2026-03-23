import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ServerNotificationTargetType = 'everyone' | 'role';

@Schema({ timestamps: true })
export class ServerNotification extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Server', required: true, index: true })
  serverId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  createdBy: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, maxlength: 120 })
  title: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 2000 })
  content: string;

  @Prop({ type: String, enum: ['everyone', 'role'], required: true })
  targetType: ServerNotificationTargetType;

  @Prop({ type: Types.ObjectId, ref: 'Role', default: null })
  targetRoleId?: Types.ObjectId | null;

  @Prop({ type: String, default: null, trim: true })
  targetRoleName?: string | null;

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  recipientUserIds: Types.ObjectId[];
}

export const ServerNotificationSchema =
  SchemaFactory.createForClass(ServerNotification);

ServerNotificationSchema.index({ serverId: 1, createdAt: -1 });
ServerNotificationSchema.index({ recipientUserIds: 1, createdAt: -1 });
