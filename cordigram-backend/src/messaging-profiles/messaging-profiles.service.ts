import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MessagingProfile, DEFAULT_MESSAGING_AVATAR_URL } from './messaging-profile.schema';
import { Profile } from '../profiles/profile.schema';
import { User } from '../users/user.schema';
import { ProfilesService } from '../profiles/profiles.service';
import { UpdateMessagingProfileDto } from './dto/update-messaging-profile.dto';

export type MessagingProfileCardDto = {
  userId: string;
  displayName: string;
  chatUsername: string;
  avatarUrl: string;
  avatarOriginalUrl: string;
  coverUrl: string;
  bio: string;
  pronouns: string;
  displayNameFontId: string | null;
  displayNameEffectId: string | null;
  displayNamePrimaryHex: string | null;
  displayNameAccentHex: string | null;
  cordigramMemberSince?: string;
  mutualServerCount: number;
  mutualServers: Array<{ serverId: string; name: string; avatarUrl: string | null }>;
  mutualFollowCount: number;
  mutualFollowUsers: Array<{
    userId: string;
    username: string;
    displayName: string;
    avatarUrl: string;
  }>;
  isFollowing: boolean;
  isCreatorVerified: boolean;
};

@Injectable()
export class MessagingProfilesService {
  constructor(
    @InjectModel(MessagingProfile.name)
    private readonly messagingProfileModel: Model<MessagingProfile>,
    @InjectModel(Profile.name) private readonly profileModel: Model<Profile>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly profilesService: ProfilesService,
  ) {}

  private asObjectId(input: string | Types.ObjectId): Types.ObjectId | null {
    if (input instanceof Types.ObjectId) return input;
    if (!Types.ObjectId.isValid(input)) return null;
    return new Types.ObjectId(input);
  }

  private toCardDto(
    mp: MessagingProfile,
    overlay: {
      mutualServerCount: number;
      mutualServers: Array<{
        serverId: string;
        name: string;
        avatarUrl: string | null;
      }>;
      mutualFollowCount: number;
      mutualFollowUsers: Array<{
        userId: string;
        username: string;
        displayName: string;
        avatarUrl: string;
      }>;
      cordigramMemberSince?: string;
      isFollowing: boolean;
      isCreatorVerified: boolean;
    },
  ): MessagingProfileCardDto {
    const uid = mp.userId?.toString?.() ?? '';
    return {
      userId: uid,
      displayName: mp.displayName ?? '',
      chatUsername: mp.chatUsername ?? '',
      avatarUrl: mp.avatarUrl || DEFAULT_MESSAGING_AVATAR_URL,
      avatarOriginalUrl: mp.avatarOriginalUrl || DEFAULT_MESSAGING_AVATAR_URL,
      coverUrl: mp.coverUrl || '',
      bio: mp.bio || '',
      pronouns: (mp as { pronouns?: string }).pronouns?.trim() || '',
      displayNameFontId: mp.displayNameFontId ?? null,
      displayNameEffectId: mp.displayNameEffectId ?? null,
      displayNamePrimaryHex: mp.displayNamePrimaryHex ?? null,
      displayNameAccentHex: mp.displayNameAccentHex ?? null,
      cordigramMemberSince: overlay.cordigramMemberSince,
      mutualServerCount: overlay.mutualServerCount,
      mutualServers: overlay.mutualServers,
      mutualFollowCount: overlay.mutualFollowCount,
      mutualFollowUsers: overlay.mutualFollowUsers,
      isFollowing: overlay.isFollowing,
      isCreatorVerified: overlay.isCreatorVerified,
    };
  }

  /**
   * Tạo bản ghi messaging từ Profile social nếu chưa có (migration từng user).
   */
  async ensureMessagingProfile(userIdStr: string): Promise<MessagingProfile> {
    const userId = this.asObjectId(userIdStr);
    if (!userId) {
      throw new BadRequestException('Invalid user id');
    }

    const existing = await this.messagingProfileModel
      .findOne({ userId })
      .exec();
    if (existing) return existing;

    const profile = await this.profileModel
      .findOne({ userId })
      .lean()
      .exec();
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    const created = await this.messagingProfileModel.create({
      userId,
      displayName: profile.displayName?.trim() || 'User',
      chatUsername: (profile.username || 'user').toLowerCase().trim(),
      bio: profile.bio || '',
      pronouns: (profile as { pronouns?: string }).pronouns?.trim() || '',
      avatarUrl: profile.avatarUrl || DEFAULT_MESSAGING_AVATAR_URL,
      avatarOriginalUrl: profile.avatarOriginalUrl || DEFAULT_MESSAGING_AVATAR_URL,
      avatarPublicId: profile.avatarPublicId || '',
      avatarOriginalPublicId: profile.avatarOriginalPublicId || '',
      coverUrl: profile.coverUrl || '',
      displayNameFontId: (profile as any).displayNameFontId ?? null,
      displayNameEffectId: (profile as any).displayNameEffectId ?? null,
      displayNamePrimaryHex: (profile as any).displayNamePrimaryHex ?? null,
      displayNameAccentHex: (profile as any).displayNameAccentHex ?? null,
    });
    return created;
  }

  async getMine(userIdStr: string): Promise<MessagingProfileCardDto> {
    await this.ensureMessagingProfile(userIdStr);
    const mp = (await this.messagingProfileModel
      .findOne({ userId: new Types.ObjectId(userIdStr) })
      .exec())!;
    const overlay = await this.profilesService.getMessagingSocialOverlay({
      viewerId: userIdStr,
      ownerUserId: userIdStr,
    });
    return this.toCardDto(mp, overlay);
  }

  async getForViewer(
    viewerIdStr: string,
    targetUserIdStr: string,
  ): Promise<MessagingProfileCardDto> {
    await this.ensureMessagingProfile(targetUserIdStr);
    const mp = (await this.messagingProfileModel
      .findOne({ userId: new Types.ObjectId(targetUserIdStr) })
      .exec())!;
    const overlay = await this.profilesService.getMessagingSocialOverlay({
      viewerId: viewerIdStr,
      ownerUserId: targetUserIdStr,
    });
    return this.toCardDto(mp, overlay);
  }

  async updateMine(
    userIdStr: string,
    dto: UpdateMessagingProfileDto,
  ): Promise<MessagingProfileCardDto> {
    const mp = await this.ensureMessagingProfile(userIdStr);

    if (dto.displayName !== undefined) {
      const v = dto.displayName.trim();
      if (!v) throw new BadRequestException('displayName is required');
      mp.displayName = v.slice(0, 80);
    }
    if (dto.chatUsername !== undefined) {
      mp.chatUsername = dto.chatUsername.toLowerCase().trim();
    }
    if (dto.bio !== undefined) {
      mp.bio = dto.bio.slice(0, 300);
    }
    if (dto.pronouns !== undefined) {
      mp.pronouns = dto.pronouns.trim().slice(0, 80);
    }
    if (dto.coverUrl !== undefined) {
      mp.coverUrl = dto.coverUrl.trim().slice(0, 2048);
    }
    if (dto.displayNameFontId !== undefined) {
      mp.displayNameFontId = dto.displayNameFontId;
    }
    if (dto.displayNameEffectId !== undefined) {
      mp.displayNameEffectId = dto.displayNameEffectId;
    }
    if (dto.displayNamePrimaryHex !== undefined) {
      mp.displayNamePrimaryHex = dto.displayNamePrimaryHex;
    }
    if (dto.displayNameAccentHex !== undefined) {
      mp.displayNameAccentHex = dto.displayNameAccentHex;
    }

    await mp.save();
    return this.getMine(userIdStr);
  }

  async updateAvatarForUser(params: {
    userId: string;
    avatarUrl: string;
    avatarOriginalUrl: string;
    avatarPublicId: string;
    avatarOriginalPublicId: string;
  }): Promise<{
    avatarUrl: string;
    avatarOriginalUrl: string;
    avatarPublicId: string;
    avatarOriginalPublicId: string;
  }> {
    const mp = await this.ensureMessagingProfile(params.userId);
    mp.avatarUrl = params.avatarUrl;
    mp.avatarOriginalUrl = params.avatarOriginalUrl;
    mp.avatarPublicId = params.avatarPublicId;
    mp.avatarOriginalPublicId = params.avatarOriginalPublicId;
    await mp.save();
    return {
      avatarUrl: mp.avatarUrl,
      avatarOriginalUrl: mp.avatarOriginalUrl,
      avatarPublicId: mp.avatarPublicId,
      avatarOriginalPublicId: mp.avatarOriginalPublicId,
    };
  }

  async resetAvatarForUser(userId: string): Promise<{
    avatarUrl: string;
    avatarOriginalUrl: string;
    avatarPublicId: string;
    avatarOriginalPublicId: string;
  }> {
    const mp = await this.ensureMessagingProfile(userId);
    mp.avatarUrl = DEFAULT_MESSAGING_AVATAR_URL;
    mp.avatarOriginalUrl = DEFAULT_MESSAGING_AVATAR_URL;
    mp.avatarPublicId = '';
    mp.avatarOriginalPublicId = '';
    await mp.save();
    return {
      avatarUrl: mp.avatarUrl,
      avatarOriginalUrl: mp.avatarOriginalUrl,
      avatarPublicId: mp.avatarPublicId,
      avatarOriginalPublicId: mp.avatarOriginalPublicId,
    };
  }

  /**
   * Payload gắn vào senderId/receiverId sau populate (tương thích client DM).
   */
  async buildDmParticipantPayload(
    userObjectId: Types.ObjectId,
    email: string,
  ): Promise<{
    _id: Types.ObjectId;
    email: string;
    displayName: string;
    username: string;
    avatar: string;
    displayNameFontId?: string | null;
    displayNameEffectId?: string | null;
    displayNamePrimaryHex?: string | null;
    displayNameAccentHex?: string | null;
  }> {
    const idStr = userObjectId.toString();
    let mp: MessagingProfile;
    try {
      mp = await this.ensureMessagingProfile(idStr);
    } catch {
      const fallbackName = email || 'User';
      return {
        _id: userObjectId,
        email,
        displayName: fallbackName,
        username: fallbackName,
        avatar: DEFAULT_MESSAGING_AVATAR_URL,
        displayNameFontId: null,
        displayNameEffectId: null,
        displayNamePrimaryHex: null,
        displayNameAccentHex: null,
      };
    }

    const display = (mp.displayName || '').trim() || email || 'User';
    const sub = (mp.chatUsername || '').trim() || display;
    return {
      _id: userObjectId,
      email,
      displayName: display,
      username: sub,
      avatar: mp.avatarUrl || DEFAULT_MESSAGING_AVATAR_URL,
      displayNameFontId: mp.displayNameFontId ?? null,
      displayNameEffectId: mp.displayNameEffectId ?? null,
      displayNamePrimaryHex: mp.displayNamePrimaryHex ?? null,
      displayNameAccentHex: mp.displayNameAccentHex ?? null,
    };
  }

}
