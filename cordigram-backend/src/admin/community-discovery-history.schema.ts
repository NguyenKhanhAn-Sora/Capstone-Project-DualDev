import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CommunityDiscoveryHistoryAction =
  | 'approve'
  | 'reject'
  | 'remove'
  | 'restore';

@Schema({ timestamps: true })
export class CommunityDiscoveryHistory extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Server', required: true, index: true })
  serverId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  adminId: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['approve', 'reject', 'remove', 'restore'],
    required: true,
  })
  action: CommunityDiscoveryHistoryAction;

  @Prop({ type: String, default: null, trim: true })
  note?: string | null;

  // Snapshot for history detail view (avoid extra joins, keep stable record)
  @Prop({ type: Object, default: {} })
  serverSnapshot: {
    name?: string;
    avatarUrl?: string | null;
    description?: string | null;
    ownerId?: string;
    memberCount?: number;
    accessMode?: string;
    communityActivatedAt?: string | null;
    communityDiscoveryStatus?: string;
  };
}

export const CommunityDiscoveryHistorySchema = SchemaFactory.createForClass(
  CommunityDiscoveryHistory,
);

CommunityDiscoveryHistorySchema.index({ serverId: 1, createdAt: -1 });
CommunityDiscoveryHistorySchema.index({ createdAt: -1 });
