import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const DEFAULT_MESSAGING_AVATAR_URL =
  process.env.DEFAULT_AVATAR_URL?.trim() ||
  'https://res.cloudinary.com/doicocgeo/image/upload/v1765850274/user-avatar-default_gfx5bs.jpg';

/**
 * Hồ sơ hiển thị trong ngữ cảnh chat / DM — tách khỏi Profile (social).
 */
@Schema({ timestamps: true, collection: 'messagingprofiles' })
export class MessagingProfile extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  displayName!: string;

  /** Tên dòng phụ trong chat (không trùng ràng buộc unique với username social). */
  @Prop({ required: true, lowercase: true, trim: true })
  chatUsername!: string;

  @Prop({ default: '' })
  bio!: string;

  @Prop({ default: '' })
  pronouns!: string;

  @Prop({ default: DEFAULT_MESSAGING_AVATAR_URL })
  avatarUrl!: string;

  @Prop({ default: DEFAULT_MESSAGING_AVATAR_URL })
  avatarOriginalUrl!: string;

  @Prop({ default: '' })
  avatarPublicId!: string;

  @Prop({ default: '' })
  avatarOriginalPublicId!: string;

  @Prop({ default: '' })
  coverUrl!: string;

  @Prop({ type: String, default: null })
  displayNameFontId?: string | null;

  @Prop({ type: String, default: null })
  displayNameEffectId?: string | null;

  @Prop({ type: String, default: null })
  displayNamePrimaryHex?: string | null;

  @Prop({ type: String, default: null })
  displayNameAccentHex?: string | null;
}

export const MessagingProfileSchema =
  SchemaFactory.createForClass(MessagingProfile);

MessagingProfileSchema.index({ userId: 1 }, { unique: true });
