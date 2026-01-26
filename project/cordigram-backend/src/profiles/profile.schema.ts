import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

const DEFAULT_AVATAR_URL =
  'https://res.cloudinary.com/doicocgeo/image/upload/v1765850274/user-avatar-default_gfx5bs.jpg';

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

  @Prop({ default: '' })
  bio: string;

  @Prop({ default: '' })
  location: string;

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
}

export const ProfileSchema = SchemaFactory.createForClass(Profile);
ProfileSchema.index({ username: 1 }, { unique: true });
