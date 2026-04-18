import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Interface định nghĩa tất cả permissions cho một role
 * Tổ chức theo 4 nhóm: Quyền Thành Viên, Quyền Kênh Tin Nhắn, Quyền Kênh Thoại, Quyền Ứng Dụng
 */
export interface RolePermissions {
  // === Quyền Quản Lý Máy Chủ ===
  manageServer: boolean; // Quản lý cài đặt máy chủ
  manageChannels: boolean; // Quản lý kênh (tạo, sửa, xóa)
  manageEvents: boolean; // Quản lý sự kiện
  /** Emoji / sticker tùy chỉnh máy chủ (khi chủ đã mở khóa ô theo Boost). */
  manageExpressions: boolean;

  // === Quyền Thành Viên ===
  createInvite: boolean; // Tạo lời mời
  changeNickname: boolean; // Đổi biệt danh
  manageNicknames: boolean; // Quản lý biệt danh của thành viên khác
  kickMembers: boolean; // Đuổi, chấp thuận và từ chối thành viên
  banMembers: boolean; // Cấm thành viên
  timeoutMembers: boolean; // Hạn chế thành viên (timeout)

  // === Quyền Kênh Tin Nhắn ===
  mentionEveryone: boolean; // Đề cập @everyone, @here và Tất Cả Vai Trò
  sendMessages: boolean; // Gửi tin nhắn và tạo bài đăng
  sendMessagesInThreads: boolean; // Gửi tin nhắn trong chủ đề và bài đăng
  embedLinks: boolean; // Nhúng liên kết
  attachFiles: boolean; // Đính kèm tập tin
  addReactions: boolean; // Thêm biểu cảm
  manageMessages: boolean; // Quản lý tin nhắn (xóa, gỡ bỏ)
  pinMessages: boolean; // Ghim tin nhắn
  viewMessageHistory: boolean; // Xem lịch sử tin nhắn
  sendVoiceMessages: boolean; // Gửi tin nhắn thoại
  createPolls: boolean; // Tạo khảo sát

  // === Quyền Kênh Thoại ===
  connect: boolean; // Kết nối
  speak: boolean; // Nói
  video: boolean; // Video
  muteMembers: boolean; // Tắt âm thành viên
  deafenMembers: boolean; // Tắt nghe thành viên
  moveMembers: boolean; // Di chuyển thành viên
  setVoiceChannelStatus: boolean; // Đặt trạng thái kênh thoại
}

/**
 * Permissions mặc định cho role @everyone
 */
export const DEFAULT_EVERYONE_PERMISSIONS: RolePermissions = {
  // Quyền Quản Lý Máy Chủ
  manageServer: false,
  manageChannels: false,
  manageEvents: false,
  manageExpressions: false,

  // Quyền Thành Viên
  createInvite: false,
  changeNickname: false,
  manageNicknames: false,
  kickMembers: false,
  banMembers: false,
  timeoutMembers: false,

  // Quyền Kênh Tin Nhắn
  mentionEveryone: false,
  sendMessages: true,
  sendMessagesInThreads: true,
  embedLinks: true,
  attachFiles: true,
  addReactions: true,
  manageMessages: false,
  pinMessages: false,
  viewMessageHistory: true,
  sendVoiceMessages: true,
  createPolls: false,

  // Quyền Kênh Thoại
  connect: true,
  speak: true,
  video: true,
  muteMembers: false,
  deafenMembers: false,
  moveMembers: false,
  setVoiceChannelStatus: false,
};

/**
 * Permissions mặc định cho role mới tạo
 */
export const DEFAULT_NEW_ROLE_PERMISSIONS: RolePermissions = {
  // Quyền Quản Lý Máy Chủ - tất cả false
  manageServer: false,
  manageChannels: false,
  manageEvents: false,
  manageExpressions: false,

  // Quyền Thành Viên - tất cả false
  createInvite: false,
  changeNickname: false,
  manageNicknames: false,
  kickMembers: false,
  banMembers: false,
  timeoutMembers: false,

  // Quyền Kênh Tin Nhắn - cơ bản true
  mentionEveryone: false,
  sendMessages: true,
  sendMessagesInThreads: true,
  embedLinks: true,
  attachFiles: true,
  addReactions: true,
  manageMessages: false,
  pinMessages: false,
  viewMessageHistory: true,
  sendVoiceMessages: true,
  createPolls: false,

  // Quyền Kênh Thoại - cơ bản true
  connect: true,
  speak: true,
  video: true,
  muteMembers: false,
  deafenMembers: false,
  moveMembers: false,
  setVoiceChannelStatus: false,
};

@Schema({ timestamps: true })
export class Role extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, default: '#99AAB5' })
  color: string; // hex color

  @Prop({ type: String, default: null })
  icon: string | null; // URL to icon image

  @Prop({ type: Types.ObjectId, ref: 'Server', required: true, index: true })
  serverId: Types.ObjectId;

  @Prop({ type: Number, default: 0 })
  position: number; // thứ tự hiển thị, số cao hơn = ưu tiên cao hơn

  @Prop({ type: Boolean, default: false })
  displaySeparately: boolean; // hiển thị riêng biệt với các thành viên trực tuyến

  @Prop({ type: Boolean, default: false })
  mentionable: boolean; // cho phép @mention vai trò này

  @Prop({ type: Boolean, default: false })
  isDefault: boolean; // true nếu là role @everyone

  @Prop({
    type: {
      // Quyền Quản Lý Máy Chủ
      manageServer: { type: Boolean, default: false },
      manageChannels: { type: Boolean, default: false },
      manageEvents: { type: Boolean, default: false },
      manageExpressions: { type: Boolean, default: false },

      // Quyền Thành Viên
      createInvite: { type: Boolean, default: false },
      changeNickname: { type: Boolean, default: false },
      manageNicknames: { type: Boolean, default: false },
      kickMembers: { type: Boolean, default: false },
      banMembers: { type: Boolean, default: false },
      timeoutMembers: { type: Boolean, default: false },

      // Quyền Kênh Tin Nhắn
      mentionEveryone: { type: Boolean, default: false },
      sendMessages: { type: Boolean, default: true },
      sendMessagesInThreads: { type: Boolean, default: true },
      embedLinks: { type: Boolean, default: true },
      attachFiles: { type: Boolean, default: true },
      addReactions: { type: Boolean, default: true },
      manageMessages: { type: Boolean, default: false },
      pinMessages: { type: Boolean, default: false },
      viewMessageHistory: { type: Boolean, default: true },
      sendVoiceMessages: { type: Boolean, default: true },
      createPolls: { type: Boolean, default: false },

      // Quyền Kênh Thoại
      connect: { type: Boolean, default: true },
      speak: { type: Boolean, default: true },
      video: { type: Boolean, default: true },
      muteMembers: { type: Boolean, default: false },
      deafenMembers: { type: Boolean, default: false },
      moveMembers: { type: Boolean, default: false },
      setVoiceChannelStatus: { type: Boolean, default: false },
    },
    default: () => ({ ...DEFAULT_NEW_ROLE_PERMISSIONS }),
  })
  permissions: RolePermissions;

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  memberIds: Types.ObjectId[]; // danh sách thành viên có role này
}

export const RoleSchema = SchemaFactory.createForClass(Role);

// Index để query nhanh các roles của một server
RoleSchema.index({ serverId: 1, position: -1 });
RoleSchema.index({ serverId: 1, isDefault: 1 });
