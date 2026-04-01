import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AuditAction =
  | 'role.add'
  | 'role.remove'
  | 'server.update'
  | 'server.safety.update'
  | 'channel.create'
  | 'channel.update'
  | 'channel.delete';

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AuditLog extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Server', required: true, index: true })
  serverId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false, index: true })
  targetUserId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  actorUserId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: [
      'role.add',
      'role.remove',
      'server.update',
      'server.safety.update',
      'channel.create',
      'channel.update',
      'channel.delete',
    ],
  })
  action: AuditAction;

  @Prop({ type: Types.ObjectId, ref: 'Role', required: false })
  roleId?: Types.ObjectId;

  @Prop({ type: String, required: false })
  roleNameSnapshot?: string;

  @Prop({
    type: String,
    required: false,
    enum: ['server', 'channel', 'member'],
  })
  targetType?: 'server' | 'channel' | 'member';

  @Prop({ type: String, required: false })
  targetId?: string;

  @Prop({ type: String, required: false })
  targetName?: string;

  @Prop({
    type: [
      {
        field: { type: String, required: true },
        from: { type: String, default: null },
        to: { type: String, default: null },
      },
    ],
    default: [],
  })
  changes: Array<{ field: string; from?: string | null; to?: string | null }>;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index({ serverId: 1, targetUserId: 1, createdAt: -1 });
