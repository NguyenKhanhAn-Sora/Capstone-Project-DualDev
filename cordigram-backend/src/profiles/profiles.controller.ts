import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Patch,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import type { Request } from 'express';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { v4 as uuid } from 'uuid';
import { ConfigService } from '../config/config.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/user.schema';
import { Server } from '../servers/server.schema';
import { ChannelMessagesGateway } from '../messages/channel-messages.gateway';
import { BoostService } from '../boost/boost.service';

type MulterFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

const avatarFileFilter = (
  req: any,
  file: MulterFile,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new BadRequestException('Please choose an image file'), false);
  }
  cb(null, true);
};

const USERNAME_REGEX = /^[a-z0-9_.]{3,30}$/;
const BIO_CHAR_LIMIT = 300;

@Controller('profiles')
export class ProfilesController {
  constructor(
    private readonly profilesService: ProfilesService,
    private readonly config: ConfigService,
    private readonly cloudinaryService: CloudinaryService,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Server.name) private readonly serverModel: Model<Server>,
    private readonly channelMessagesGateway: ChannelMessagesGateway,
    private readonly boostService: BoostService,
  ) {}

  @Get('check-username')
  async checkUsername(
    @Query('username') username?: string,
    @Query('excludeUserId') excludeUserId?: string,
  ): Promise<{ available: boolean }> {
    if (!username) {
      throw new BadRequestException('username is required');
    }
    const normalized = username.toLowerCase();
    if (!USERNAME_REGEX.test(normalized)) {
      throw new BadRequestException('username is invalid');
    }

    const available = await this.profilesService.isUsernameAvailable(
      normalized,
      excludeUserId,
    );
    return { available };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(
    @Req()
    req: Request & {
      user?: AuthenticatedUser;
    },
  ) {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    const profile = await this.profilesService.findByUserId(user.userId);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    const userDoc = await this.userModel
      .findById(user.userId)
      .select(
        'status signupStage accountLimitedUntil accountLimitedIndefinitely isCreatorVerified',
      )
      .lean();

    return {
      id: profile._id?.toString?.() ?? (profile as { id?: string }).id,
      userId: profile.userId?.toString?.() ?? user.userId,
      displayName: profile.displayName,
      username: profile.username,
      avatarUrl: profile.avatarUrl,
      displayNameFontId: (profile as any).displayNameFontId ?? null,
      displayNameEffectId: (profile as any).displayNameEffectId ?? null,
      displayNamePrimaryHex: (profile as any).displayNamePrimaryHex ?? null,
      displayNameAccentHex: (profile as any).displayNameAccentHex ?? null,
      status: userDoc?.status ?? 'active',
      isCreatorVerified: Boolean(userDoc?.isCreatorVerified),
      signupStage: userDoc?.signupStage ?? 'completed',
      accountLimitedUntil: userDoc?.accountLimitedUntil ?? null,
      accountLimitedIndefinitely: Boolean(userDoc?.accountLimitedIndefinitely),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  async updateMe(
    @Req()
    req: Request & {
      user?: AuthenticatedUser;
    },
    @Body() dto: UpdateProfileDto,
  ) {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    const nextUsername = dto.username?.toLowerCase().trim();
    if (dto.username !== undefined) {
      if (!nextUsername) {
        throw new BadRequestException('username is required');
      }
      if (!USERNAME_REGEX.test(nextUsername)) {
        throw new BadRequestException('username is invalid');
      }
    }

    const nextBirthdate = dto.birthdate ? new Date(dto.birthdate) : undefined;
    if (dto.birthdate && Number.isNaN(nextBirthdate?.getTime?.())) {
      throw new BadRequestException('birthdate is invalid');
    }
    if (dto.birthdate && nextBirthdate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const chosen = new Date(nextBirthdate);
      chosen.setHours(0, 0, 0, 0);
      if (chosen > today) {
        throw new BadRequestException('birthdate cannot be in the future');
      }
    }

    if (dto.bio !== undefined) {
      const length = dto.bio.length;
      if (length > BIO_CHAR_LIMIT) {
        throw new BadRequestException(
          `bio must be at most ${BIO_CHAR_LIMIT} characters`,
        );
      }
    }

    if (dto.pronouns !== undefined && dto.pronouns.length > 80) {
      throw new BadRequestException('pronouns must be at most 80 characters');
    }

    if (dto.coverUrl !== undefined) {
      const trimmed = (dto.coverUrl ?? '').trim();
      const isImageUrl = /^https?:\/\//i.test(trimmed);
      const accountBoost = Boolean((user as any)?.settings?.accountBoost);
      const ent = await this.boostService.getBoostStatus(user.userId);
      const unlocked = accountBoost || Boolean(ent?.active);
      if (isImageUrl && !unlocked) {
        throw new ForbiddenException('Boost required for banner image');
      }
    }

    await this.profilesService.updateForUserId(user.userId, {
      displayName: dto.displayName,
      username: nextUsername,
      bio: dto.bio,
      pronouns: dto.pronouns,
      coverUrl: dto.coverUrl,
      profileThemePrimaryHex: dto.profileThemePrimaryHex,
      profileThemeAccentHex: dto.profileThemeAccentHex,
      displayNameFontId: dto.displayNameFontId,
      displayNameEffectId: dto.displayNameEffectId,
      displayNamePrimaryHex: dto.displayNamePrimaryHex,
      displayNameAccentHex: dto.displayNameAccentHex,
      location: dto.location,
      gender: dto.gender,
      birthdate: dto.birthdate,
      workplaceName: dto.workplaceName,
      workplaceCompanyId: dto.workplaceCompanyId,
      genderVisibility: dto.genderVisibility,
      birthdateVisibility: dto.birthdateVisibility,
      locationVisibility: dto.locationVisibility,
      workplaceVisibility: dto.workplaceVisibility,
      bioVisibility: dto.bioVisibility,
      followersVisibility: dto.followersVisibility,
      followingVisibility: dto.followingVisibility,
      aboutVisibility: dto.aboutVisibility,
      profileVisibility: dto.profileVisibility,
    });

    // Realtime: push to all members who share servers with this user (and to self).
    try {
      const uid = user.userId;
      const servers = await this.serverModel
        .find({ 'members.userId': uid })
        .select('members.userId')
        .lean()
        .exec();
      const memberIds = new Set<string>();
      for (const s of servers as any[]) {
        for (const m of s?.members ?? []) {
          const id = (m?.userId?._id ?? m?.userId)?.toString?.();
          if (id) memberIds.add(id);
        }
      }
      memberIds.add(uid);

      const payload = {
        userId: uid,
        coverUrl: dto.coverUrl,
        profileThemePrimaryHex: dto.profileThemePrimaryHex,
        profileThemeAccentHex: dto.profileThemeAccentHex,
        displayNameFontId: dto.displayNameFontId,
        displayNameEffectId: dto.displayNameEffectId,
        displayNamePrimaryHex: dto.displayNamePrimaryHex,
        displayNameAccentHex: dto.displayNameAccentHex,
        updatedAt: new Date().toISOString(),
      };

      memberIds.forEach((id) => {
        this.channelMessagesGateway.emitToUser(id, 'user-profile-style-updated', payload);
      });
    } catch {
      // ignore realtime failures
    }

    return this.profilesService.getProfileDetails({
      usernameOrId: user.userId,
      viewerId: user.userId,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('search')
  async searchProfiles(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    if (!q || !q.trim()) {
      throw new BadRequestException('q is required');
    }

    const results = await this.profilesService.searchProfiles({
      query: q,
      limit: limit ? Number(limit) : 8,
      excludeUserId: user.userId,
    });

    return {
      items: results,
      count: results.length,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':usernameOrId')
  async getProfileById(
    @Param('usernameOrId') usernameOrId: string,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    return this.profilesService.getProfileDetails({
      usernameOrId,
      viewerId: user.userId,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('avatar/upload')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'original', maxCount: 1 },
        { name: 'cropped', maxCount: 1 },
      ],
      {
        limits: { fileSize: MAX_AVATAR_BYTES },
        fileFilter: avatarFileFilter,
      },
    ),
  )
  async uploadAvatar(
    @UploadedFiles()
    files: {
      original?: MulterFile[];
      cropped?: MulterFile[];
    },
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    const originalFile = files?.original?.[0];
    const croppedFile = files?.cropped?.[0];
    if (!originalFile) {
      throw new BadRequestException('Thiếu file original');
    }

    const folder = [
      this.config.cloudinaryFolder,
      'users',
      user.userId,
      'avatars',
    ]
      .filter(Boolean)
      .join('/');

    const suffix = uuid();
    const isGif =
      originalFile.mimetype === 'image/gif' ||
      originalFile.originalname?.toLowerCase?.().endsWith?.('.gif');

    if (isGif) {
      const accountBoost = Boolean((user as any)?.settings?.accountBoost);
      const ent = await this.boostService.getBoostStatus(user.userId);
      const unlocked = accountBoost || Boolean(ent?.active);
      if (!unlocked) {
        throw new BadRequestException('Boost required for GIF avatar');
      }
    }

    // Animated avatars (GIF): accept original only to preserve animation.
    if (!croppedFile) {
      if (!isGif) {
        throw new BadRequestException('Thiếu file cropped');
      }
      const uploaded = await this.cloudinaryService.uploadBuffer({
        buffer: originalFile.buffer,
        folder,
        publicId: `avatar-${suffix}`,
      });
      return this.profilesService.updateAvatarForUser({
        userId: user.userId,
        avatarUrl: uploaded.secureUrl,
        avatarOriginalUrl: uploaded.secureUrl,
        avatarPublicId: uploaded.publicId,
        avatarOriginalPublicId: uploaded.publicId,
      });
    }

    const [original, cropped] = await Promise.all([
      this.cloudinaryService.uploadBuffer({
        buffer: originalFile.buffer,
        folder,
        publicId: `original-${suffix}`,
      }),
      this.cloudinaryService.uploadBuffer({
        buffer: croppedFile.buffer,
        folder,
        publicId: `avatar-${suffix}`,
      }),
    ]);

    return this.profilesService.updateAvatarForUser({
      userId: user.userId,
      avatarUrl: cropped.secureUrl,
      avatarOriginalUrl: original.secureUrl,
      avatarPublicId: cropped.publicId,
      avatarOriginalPublicId: original.publicId,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Delete('avatar')
  async resetAvatar(@Req() req: Request & { user?: AuthenticatedUser }) {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    return this.profilesService.resetAvatarForUser(user.userId);
  }
}
