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

export interface ServerInteractionSettings {
  systemMessagesEnabled: boolean;
  welcomeMessageEnabled: boolean;
  setupTipsEnabled: boolean;
  activityFeedEnabled: boolean;
  defaultNotificationLevel: 'all' | 'mentions';
  systemChannelId?: Types.ObjectId | null;
}

@Schema({ timestamps: true })
export class Server extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, default: null })
  description: string | null;

  @Prop({ type: String, default: null })
  avatarUrl: string | null;

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

  @Prop({ type: Number, default: 0 })
  memberCount: number;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Boolean, default: true })
  isPublic: boolean;

  @Prop({
    type: {
      systemMessagesEnabled: { type: Boolean, default: true },
      welcomeMessageEnabled: { type: Boolean, default: true },
      setupTipsEnabled: { type: Boolean, default: true },
      activityFeedEnabled: { type: Boolean, default: true },
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
      setupTipsEnabled: true,
      activityFeedEnabled: true,
      defaultNotificationLevel: 'all',
      systemChannelId: null,
    }),
  })
  interactionSettings: ServerInteractionSettings;
}

export const ServerSchema = SchemaFactory.createForClass(Server);
ServerSchema.index({ ownerId: 1 });
ServerSchema.index({ 'members.userId': 1 });