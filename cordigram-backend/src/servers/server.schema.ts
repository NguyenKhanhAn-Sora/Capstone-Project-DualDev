import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChannelType = 'text' | 'voice';
export type ServerTemplate =
  | 'custom'
  | 'gaming'
  | 'friends'
  | 'study-group'
  | 'school-club'
  | 'local-community'
  | 'artists-creators';
export type ServerPurpose = 'club-community' | 'me-and-friends';

export type ServerAccessMode = 'invite_only' | 'apply' | 'discoverable';

export interface ServerMember {
  userId: Types.ObjectId;
  role: 'owner' | 'moderator' | 'member';
  joinedAt: Date;
  timeoutUntil?: Date | null; // Thời điểm hết timeout (null = không bị timeout)
}

export interface BannedUser {
  userId: Types.ObjectId;
  bannedAt: Date;
  bannedBy: Types.ObjectId;
  reason: string | null;
}

export interface ServerCategory {
  _id: Types.ObjectId;
  name: string;
  position: number;
  isPrivate: boolean;
}

export interface ServerInteractionSettings {
  systemMessagesEnabled: boolean;
  welcomeMessageEnabled: boolean;
  stickerReplyWelcomeEnabled: boolean;
  defaultNotificationLevel: 'all' | 'mentions';
  systemChannelId?: Types.ObjectId | null;
}

export interface ServerSafetySettings {
  spamProtection: {
    verificationLevel: 'low' | 'medium' | 'high';
    hideMutedDm: boolean;
    filterDmSpam: boolean;
    warnExternalLinks: boolean;
    hideSpamMessages: boolean;
    deleteSpammerMessages: boolean;
  };
  automod: {
    bannedWords: string[];
    blockInUsername: boolean;
    bannedWordResponse: 'warn' | 'delete';
    exemptRoleIds: string[];
    spamSuspectEnabled: boolean;
    spamSuspectResponse: 'warn' | 'block';
    spamAllowedChannelIds: string[];
    spamAllowedRoleIds: string[];
    mentionSpamLimit: number;
    mentionSpamWindowMinutes: number;
    mentionAttackDetection: boolean;
    mentionSpamResponse: 'warn' | 'block24h' | 'timeout';
    mentionTimeoutMinutes: number;
  };
  privileges: {
    bypassRoleIds: string[];
    managerRoleIds: string[];
  };
}

@Schema({ timestamps: true })
export class Server extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, default: null })
  description: string | null;

  @Prop({ type: String, default: null })
  avatarUrl: string | null;

  @Prop({ type: String, default: null })
  bannerUrl: string | null;

  @Prop({
    type: [
      {
        emoji: { type: String, trim: true, default: '🙂' },
        text: { type: String, trim: true, maxlength: 80, default: '' },
      },
    ],
    default: [],
  })
  profileTraits: Array<{ emoji: string; text: string }>;

  @Prop({
    type: String,
    enum: [
      'custom',
      'gaming',
      'friends',
      'study-group',
      'school-club',
      'local-community',
      'artists-creators',
    ],
    default: 'custom',
  })
  template: ServerTemplate;

  @Prop({
    type: String,
    enum: ['club-community', 'me-and-friends'],
    default: 'me-and-friends',
  })
  purpose: ServerPurpose;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  ownerId: Types.ObjectId;

  @Prop({
    type: [
      {
        userId: { type: Types.ObjectId, ref: 'User' },
        role: {
          type: String,
          enum: ['owner', 'moderator', 'member'],
          default: 'member',
        },
        joinedAt: { type: Date, default: Date.now },
        timeoutUntil: { type: Date, default: null }, // Thời điểm hết timeout
      },
    ],
    default: [],
  })
  members: ServerMember[];

  @Prop({
    type: [
      {
        userId: { type: Types.ObjectId, ref: 'User' },
        bannedAt: { type: Date, default: Date.now },
        bannedBy: { type: Types.ObjectId, ref: 'User' },
        reason: { type: String, default: null },
      },
    ],
    default: [],
  })
  bannedUsers: BannedUser[];

  @Prop({ type: [Types.ObjectId], ref: 'Channel', default: [] })
  channels: Types.ObjectId[];

  @Prop({
    type: [
      {
        _id: { type: Types.ObjectId, auto: true },
        name: { type: String, required: true },
        position: { type: Number, default: 0 },
        isPrivate: { type: Boolean, default: false },
      },
    ],
    default: [],
  })
  serverCategories: ServerCategory[];

  @Prop({ type: Number, default: 0 })
  memberCount: number;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Boolean, default: true })
  isPublic: boolean;

  /**
   * Control cách user tham gia server + điều kiện chat.
   * Default set discoverable để tương thích với behavior hiện tại.
   */
  @Prop({
    type: String,
    enum: ['invite_only', 'apply', 'discoverable'],
    default: 'discoverable',
  })
  accessMode: ServerAccessMode;

  @Prop({ type: Boolean, default: false })
  isAgeRestricted: boolean;

  @Prop({ type: Boolean, default: false })
  hasRules: boolean;

  @Prop({
    type: {
      systemMessagesEnabled: { type: Boolean, default: true },
      welcomeMessageEnabled: { type: Boolean, default: true },
      stickerReplyWelcomeEnabled: { type: Boolean, default: true },
      defaultNotificationLevel: {
        type: String,
        enum: ['all', 'mentions'],
        default: 'all',
      },
      systemChannelId: { type: Types.ObjectId, ref: 'Channel', default: null },
    },
    default: () => ({
      systemMessagesEnabled: true,
      welcomeMessageEnabled: true,
      stickerReplyWelcomeEnabled: true,
      defaultNotificationLevel: 'all',
      systemChannelId: null,
    }),
  })
  interactionSettings: ServerInteractionSettings;

  @Prop({
    type: {
      spamProtection: {
        verificationLevel: {
          type: String,
          enum: ['low', 'medium', 'high'],
          default: 'low',
        },
        hideMutedDm: { type: Boolean, default: false },
        filterDmSpam: { type: Boolean, default: false },
        warnExternalLinks: { type: Boolean, default: true },
        hideSpamMessages: { type: Boolean, default: false },
        deleteSpammerMessages: { type: Boolean, default: false },
      },
      automod: {
        bannedWords: { type: [String], default: [] },
        blockInUsername: { type: Boolean, default: false },
        bannedWordResponse: {
          type: String,
          enum: ['warn', 'delete'],
          default: 'warn',
        },
        exemptRoleIds: { type: [String], default: [] },
        spamSuspectEnabled: { type: Boolean, default: false },
        spamSuspectResponse: {
          type: String,
          enum: ['warn', 'block'],
          default: 'warn',
        },
        spamAllowedChannelIds: { type: [String], default: [] },
        spamAllowedRoleIds: { type: [String], default: [] },
        mentionSpamLimit: { type: Number, default: 8 },
        mentionSpamWindowMinutes: { type: Number, default: 10 },
        mentionAttackDetection: { type: Boolean, default: false },
        mentionSpamResponse: {
          type: String,
          enum: ['warn', 'block24h', 'timeout'],
          default: 'warn',
        },
        mentionTimeoutMinutes: { type: Number, default: 30 },
      },
      privileges: {
        bypassRoleIds: { type: [String], default: [] },
        managerRoleIds: { type: [String], default: [] },
      },
    },
    default: () => ({
      spamProtection: {
        verificationLevel: 'low',
        hideMutedDm: false,
        filterDmSpam: false,
        warnExternalLinks: true,
        hideSpamMessages: false,
        deleteSpammerMessages: false,
      },
      automod: {
        bannedWords: [],
        blockInUsername: false,
        bannedWordResponse: 'warn',
        exemptRoleIds: [],
        spamSuspectEnabled: false,
        spamSuspectResponse: 'warn',
        spamAllowedChannelIds: [],
        spamAllowedRoleIds: [],
        mentionSpamLimit: 8,
        mentionSpamWindowMinutes: 10,
        mentionAttackDetection: false,
        mentionSpamResponse: 'warn',
        mentionTimeoutMinutes: 30,
      },
      privileges: {
        bypassRoleIds: [],
        managerRoleIds: [],
      },
    }),
  })
  safetySettings: ServerSafetySettings;
}

export const ServerSchema = SchemaFactory.createForClass(Server);
ServerSchema.index({ ownerId: 1 });
ServerSchema.index({ 'members.userId': 1 });
