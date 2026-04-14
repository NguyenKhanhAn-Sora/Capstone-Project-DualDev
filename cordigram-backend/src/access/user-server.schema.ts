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

  /** Câu trả lời đơn đăng ký tham gia (chế độ apply + form bật). */
  @Prop({
    type: [
      {
        questionId: { type: String, required: true },
        text: { type: String },
        selectedOption: { type: String },
      },
    ],
    default: undefined,
  })
  joinApplicationAnswers?: Array<{
    questionId: string;
    text?: string;
    selectedOption?: string;
  }>;

  /** Thời điểm gửi / cập nhật đơn (apply). */
  @Prop({ type: Date })
  applicationSubmittedAt?: Date;

  /**
   * Thời điểm được chấp thuận (apply to join).
   * Dùng để tính "đã là thành viên > 10 phút" kể từ lúc được duyệt, không phải lúc nộp đơn.
   */
  @Prop({ type: Date, default: null })
  acceptedAt?: Date | null;

  @Prop({ type: String, default: null })
  nickname?: string | null;
}

export const UserServerSchema = SchemaFactory.createForClass(UserServer);

UserServerSchema.index({ userId: 1, serverId: 1 }, { unique: true });
