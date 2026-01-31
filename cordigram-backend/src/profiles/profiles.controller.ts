import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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

type MulterFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

const MAX_AVATAR_BYTES = Number(
  process.env.CLOUDINARY_MAX_FILE_SIZE ?? 15 * 1024 * 1024,
);

const avatarFileFilter = (
  _req: unknown,
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

    return {
      id: profile._id?.toString?.() ?? (profile as { id?: string }).id,
      userId: profile.userId?.toString?.() ?? user.userId,
      displayName: profile.displayName,
      username: profile.username,
      avatarUrl: profile.avatarUrl,
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

    await this.profilesService.updateForUserId(user.userId, {
      displayName: dto.displayName,
      username: nextUsername,
      bio: dto.bio,
      location: dto.location,
      gender: dto.gender,
      birthdate: dto.birthdate,
      workplaceName: dto.workplaceName,
      workplaceCompanyId: dto.workplaceCompanyId,
    });

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
    if (!originalFile || !croppedFile) {
      throw new BadRequestException('Thiếu file original hoặc cropped');
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
