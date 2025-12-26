import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type Role = 'user' | 'creator' | 'admin';
export type Status = 'active' | 'banned' | 'pending';
export type OAuthProvider = {
  provider: 'google' | 'local';
  providerId: string;
  refreshToken?: string | null;
};

export type RecentAccount = {
  email: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  lastUsed?: Date;
};

export type UserSettings = {
  theme: 'light' | 'dark';
};

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ type: String, default: null })
  passwordHash: string | null;

  @Prop({
    type: [
      {
        provider: { type: String },
        providerId: { type: String },
        refreshToken: { type: String },
      },
    ],
    default: [],
  })
  oauthProviders: OAuthProvider[];

  @Prop({ type: [String], default: ['user'] })
  roles: Role[];

  @Prop({ type: String, default: 'pending' })
  status: Status;

  @Prop({ type: Boolean, default: false })
  isVerified: boolean;

  @Prop({ type: String, default: 'otp_pending' })
  signupStage: 'otp_pending' | 'info_pending' | 'completed';

  @Prop({
    type: {
      theme: { type: String, enum: ['light', 'dark'], default: 'light' },
    },
    default: { theme: 'light' },
  })
  settings: UserSettings;

  @Prop({
    type: [
      {
        email: { type: String, lowercase: true, trim: true },
        displayName: { type: String },
        username: { type: String },
        avatarUrl: { type: String },
        lastUsed: { type: Date },
      },
    ],
    default: [],
  })
  recentAccounts: RecentAccount[];
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ email: 1 }, { unique: true });
