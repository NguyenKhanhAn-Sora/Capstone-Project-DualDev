import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

const DEFAULT_AVATAR_URL =
  process.env.DEFAULT_AVATAR_URL?.trim() ||
  'https://res.cloudinary.com/doicocgeo/image/upload/v1765850274/user-avatar-default_gfx5bs.jpg';

export type ProfileFieldVisibility = 'public' | 'followers' | 'private';
export type ProfileVisibility = {
  gender: ProfileFieldVisibility;
  birthdate: ProfileFieldVisibility;
  location: ProfileFieldVisibility;
  workplace: ProfileFieldVisibility;
  bio: ProfileFieldVisibility;
  followers: ProfileFieldVisibility;
  following: ProfileFieldVisibility;
  about: ProfileFieldVisibility;
  profile: ProfileFieldVisibility;
};

@Schema({ timestamps: true })
export class Profile extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', index: true, required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  displayName: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  username: string;

  @Prop({ default: DEFAULT_AVATAR_URL })
  avatarUrl: string;

  @Prop({ default: DEFAULT_AVATAR_URL })
  avatarOriginalUrl: string;

  @Prop({ default: '' })
  avatarPublicId: string;

  @Prop({ default: '' })
  avatarOriginalPublicId: string;

  @Prop({ default: '' })
  coverUrl: string;

  // =========================
  // Boost profile customization
  // =========================

  @Prop({ type: String, default: null })
  profileThemePrimaryHex?: string | null;

  @Prop({ type: String, default: null })
  profileThemeAccentHex?: string | null;

  @Prop({ type: String, default: null })
  displayNameFontId?: string | null;

  @Prop({ type: String, default: null })
  displayNameEffectId?: string | null;

  @Prop({ type: String, default: null })
  displayNamePrimaryHex?: string | null;

  @Prop({ type: String, default: null })
  displayNameAccentHex?: string | null;

  @Prop({ default: '' })
  bio: string;

  /** Đại từ nhân xưng (hiển thị trên card hồ sơ). */
  @Prop({ default: '' })
  pronouns: string;

  @Prop({ default: '' })
  location: string;

  @Prop({
    type: {
      companyId: { type: Types.ObjectId, ref: 'Company', default: null },
      companyName: { type: String, default: '' },
    },
    _id: false,
    default: { companyId: null, companyName: '' },
  })
  workplace: { companyId: Types.ObjectId | null; companyName: string };

  @Prop({
    type: String,
    enum: ['male', 'female', 'other', 'prefer_not_to_say', ''],
    default: '',
  })
  gender: 'male' | 'female' | 'other' | 'prefer_not_to_say' | '';

  @Prop({ type: Object, default: {} })
  links: Record<string, string>;

  @Prop({
    type: {
      followersCount: { type: Number, default: 0 },
      followingCount: { type: Number, default: 0 },
      postsCount: { type: Number, default: 0 },
    },
    _id: false,
  })
  stats: { followersCount: number; followingCount: number; postsCount: number };

  @Prop({ type: Date, default: null })
  birthdate: Date | null;

  @Prop({
    type: {
      gender: {
        type: String,
        enum: ['public', 'followers', 'private'],
        default: 'public',
      },
      birthdate: {
        type: String,
        enum: ['public', 'followers', 'private'],
        default: 'public',
      },
      location: {
        type: String,
        enum: ['public', 'followers', 'private'],
        default: 'public',
      },
      workplace: {
        type: String,
        enum: ['public', 'followers', 'private'],
        default: 'public',
      },
      bio: {
        type: String,
        enum: ['public', 'followers', 'private'],
        default: 'public',
      },
      followers: {
        type: String,
        enum: ['public', 'followers', 'private'],
        default: 'public',
      },
      following: {
        type: String,
        enum: ['public', 'followers', 'private'],
        default: 'public',
      },
      about: {
        type: String,
        enum: ['public', 'followers', 'private'],
        default: 'public',
      },
      profile: {
        type: String,
        enum: ['public', 'followers', 'private'],
        default: 'public',
      },
    },
    _id: false,
    default: {
      gender: 'public',
      birthdate: 'public',
      location: 'public',
      workplace: 'public',
      bio: 'public',
      followers: 'public',
      following: 'public',
      about: 'public',
      profile: 'public',
    },
  })
  visibility: ProfileVisibility;
}

export const ProfileSchema = SchemaFactory.createForClass(Profile);
ProfileSchema.index({ username: 1 }, { unique: true });
ProfileSchema.index({ 'workplace.companyId': 1 });
