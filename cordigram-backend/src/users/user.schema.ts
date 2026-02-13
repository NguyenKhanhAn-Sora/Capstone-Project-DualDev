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
  language: 'en' | 'vi';
  notifications?: {
    mutedUntil?: Date | null;
    mutedIndefinitely?: boolean;
    lastSeenAt?: Date | null;
    categories?: {
      follow?: {
        mutedUntil?: Date | null;
        mutedIndefinitely?: boolean;
      };
      comment?: {
        mutedUntil?: Date | null;
        mutedIndefinitely?: boolean;
      };
      like?: {
        mutedUntil?: Date | null;
        mutedIndefinitely?: boolean;
      };
      mentions?: {
        mutedUntil?: Date | null;
        mutedIndefinitely?: boolean;
      };
    };
  };
};

export type EmailChangeRequest = {
  newEmail?: string | null;
  currentVerifiedAt?: Date | null;
  newVerifiedAt?: Date | null;
  requestedAt?: Date | null;
};

export type PasswordChangeRequest = {
  requestedAt?: Date | null;
  verifiedAt?: Date | null;
};

export type PasskeyChangeRequest = {
  requestedAt?: Date | null;
  verifiedAt?: Date | null;
};

export type TrustedDevice = {
  deviceIdHash: string;
  userAgent?: string;
  lastUsed?: Date;
  expiresAt?: Date;
};

export type LoginDevice = {
  deviceIdHash: string;
  userAgent?: string;
  deviceInfo?: string;
  ip?: string;
  location?: string;
  deviceType?: string;
  os?: string;
  browser?: string;
  loginMethod?: string;
  firstSeenAt?: Date;
  lastSeenAt?: Date;
};

export type TwoFactorTrustedDevice = {
  deviceIdHash: string;
  userAgent?: string;
  trustedAt?: Date;
  expiresAt?: Date;
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
      language: { type: String, enum: ['en', 'vi'], default: 'en' },
      notifications: {
        mutedUntil: { type: Date, default: null },
        mutedIndefinitely: { type: Boolean, default: false },
        lastSeenAt: { type: Date, default: null },
        categories: {
          follow: {
            mutedUntil: { type: Date, default: null },
            mutedIndefinitely: { type: Boolean, default: false },
          },
          comment: {
            mutedUntil: { type: Date, default: null },
            mutedIndefinitely: { type: Boolean, default: false },
          },
          like: {
            mutedUntil: { type: Date, default: null },
            mutedIndefinitely: { type: Boolean, default: false },
          },
          mentions: {
            mutedUntil: { type: Date, default: null },
            mutedIndefinitely: { type: Boolean, default: false },
          },
        },
      },
    },
    default: {
      theme: 'light',
      language: 'en',
      notifications: {
        mutedUntil: null,
        mutedIndefinitely: false,
        lastSeenAt: null,
        categories: {
          follow: { mutedUntil: null, mutedIndefinitely: false },
          comment: { mutedUntil: null, mutedIndefinitely: false },
          like: { mutedUntil: null, mutedIndefinitely: false },
          mentions: { mutedUntil: null, mutedIndefinitely: false },
        },
      },
    },
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

  @Prop({ type: [String], default: [] })
  interests: string[];

  @Prop({
    type: {
      newEmail: { type: String, lowercase: true, trim: true, default: null },
      currentVerifiedAt: { type: Date, default: null },
      newVerifiedAt: { type: Date, default: null },
      requestedAt: { type: Date, default: null },
    },
    default: null,
  })
  emailChange?: EmailChangeRequest | null;

  @Prop({
    type: {
      requestedAt: { type: Date, default: null },
      verifiedAt: { type: Date, default: null },
    },
    default: null,
  })
  passwordChange?: PasswordChangeRequest | null;

  @Prop({ type: String, default: null })
  passkey?: string | null;

  @Prop({ type: Boolean, default: true })
  passkeyEnabled?: boolean;

  @Prop({
    type: {
      requestedAt: { type: Date, default: null },
      verifiedAt: { type: Date, default: null },
    },
    default: null,
  })
  passkeyChange?: PasskeyChangeRequest | null;

  @Prop({
    type: [
      {
        deviceIdHash: { type: String },
        userAgent: { type: String },
        lastUsed: { type: Date },
        expiresAt: { type: Date },
      },
    ],
    default: [],
  })
  trustedDevices?: TrustedDevice[];

  @Prop({
    type: [
      {
        deviceIdHash: { type: String },
        userAgent: { type: String },
        deviceInfo: { type: String },
        ip: { type: String },
        location: { type: String },
        deviceType: { type: String },
        os: { type: String },
        browser: { type: String },
        loginMethod: { type: String },
        firstSeenAt: { type: Date },
        lastSeenAt: { type: Date },
      },
    ],
    default: [],
  })
  loginDevices?: LoginDevice[];

  @Prop({ type: Boolean, default: false })
  twoFactorEnabled?: boolean;

  @Prop({
    type: [
      {
        deviceIdHash: { type: String },
        userAgent: { type: String },
        trustedAt: { type: Date },
        expiresAt: { type: Date },
      },
    ],
    default: [],
  })
  twoFactorTrustedDevices?: TwoFactorTrustedDevice[];

  @Prop({ type: String, default: null })
  region?: string | null;

  @Prop({ type: String, default: null })
  language?: string | null;

  @Prop({ type: Date, default: null })
  passwordChangedAt?: Date | null;

  @Prop({ type: Number, default: 0 })
  followerCount: number;

  @Prop({ type: Number, default: 0 })
  followingCount: number;
}

export const UserSchema = SchemaFactory.createForClass(User);
