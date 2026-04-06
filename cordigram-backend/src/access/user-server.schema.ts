import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserServerStatus = 'pending' | 'accepted' | 'rejected';

@Schema({ timestamps: true })
export class UserServer extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Server', required: true, index: true })
  serverId: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    required: true,
    default: 'pending',
    index: true,
  })
  status: UserServerStatus;

  // Khi user đã chấp nhận quy định của server (nếu server có bật rules)
  @Prop({ type: Boolean, default: false })
  acceptedRules: boolean;

  /** User 18+ đã xác nhận cảnh báo máy chủ giới hạn độ tuổi (Tiếp tục). */
  @Prop({ type: Boolean, default: false })
  ageRestrictedAcknowledged: boolean;

  /** User đã xác minh email cho server này (per-server email verification). */
  @Prop({ type: Boolean, default: false })
  serverEmailVerified: boolean;
}

export const UserServerSchema = SchemaFactory.createForClass(UserServer);

UserServerSchema.index({ userId: 1, serverId: 1 }, { unique: true });
