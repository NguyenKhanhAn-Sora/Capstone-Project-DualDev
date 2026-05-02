import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import type { Request } from 'express';
import { v4 as uuid } from 'uuid';
import { ConfigService } from '../config/config.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { BoostService } from '../boost/boost.service';
import { isCordigramMessagesUpload } from '../common/cordigram-upload-context';
import { MessagingProfilesService } from './messaging-profiles.service';
import { UpdateMessagingProfileDto } from './dto/update-messaging-profile.dto';
import { Types } from 'mongoose';

type MulterFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_UPLOAD_MULTER_CEILING = 600 * 1024 * 1024;

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

@Controller('messaging-profiles')
@UseGuards(JwtAuthGuard)
export class MessagingProfilesController {
  constructor(
    private readonly messagingProfilesService: MessagingProfilesService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly config: ConfigService,
    private readonly boostService: BoostService,
  ) {}

  @Get('me')
  async getMine(@Req() req: Request & { user?: AuthenticatedUser }) {
    const user = req.user;
    if (!user) throw new UnauthorizedException('Unauthorized');
    return this.messagingProfilesService.getMine(user.userId);
  }

  @Patch('me')
  async patchMine(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Body() body: UpdateMessagingProfileDto,
  ) {
    const user = req.user;
    if (!user) throw new UnauthorizedException('Unauthorized');
    return this.messagingProfilesService.updateMine(user.userId, body);
  }

  @Get(':userId')
  async getByUserId(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Param('userId') userId: string,
  ) {
    const user = req.user;
    if (!user) throw new UnauthorizedException('Unauthorized');
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user id');
    }
    return this.messagingProfilesService.getForViewer(user.userId, userId);
  }

  @Post('avatar/upload')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'original', maxCount: 1 },
        { name: 'cropped', maxCount: 1 },
      ],
      {
        limits: { fileSize: AVATAR_UPLOAD_MULTER_CEILING },
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
    if (!user) throw new UnauthorizedException('Unauthorized');

    const originalFile = files?.original?.[0];
    const croppedFile = files?.cropped?.[0];
    if (!originalFile) {
      throw new BadRequestException('Thiếu file original');
    }

    const reqAny = req as Request & { user?: AuthenticatedUser };
    const boost = await this.boostService.getBoostStatus(user.userId);
    const maxAvatarBytes = isCordigramMessagesUpload(reqAny)
      ? boost.active
        ? boost.limits.maxUploadBytes
        : MAX_AVATAR_BYTES
      : MAX_AVATAR_BYTES;
    for (const f of [originalFile, croppedFile].filter(
      Boolean,
    ) as MulterFile[]) {
      if (typeof f.size === 'number' && f.size > maxAvatarBytes) {
        throw new BadRequestException(
          `File too large (max ${maxAvatarBytes} bytes)`,
        );
      }
    }

    const folder = [
      this.config.cloudinaryFolder,
      'users',
      user.userId,
      'messaging-avatars',
    ]
      .filter(Boolean)
      .join('/');

    const suffix = uuid();
    const isGif =
      originalFile.mimetype === 'image/gif' ||
      originalFile.originalname?.toLowerCase?.().endsWith?.('.gif');

    if (isGif) {
      const accountBoost = Boolean((user as any)?.settings?.accountBoost);
      const unlocked = accountBoost || Boolean(boost?.active);
      if (!unlocked) {
        throw new BadRequestException('Boost required for GIF avatar');
      }
    }

    if (!croppedFile) {
      if (!isGif) {
        throw new BadRequestException('Thiếu file cropped');
      }
      const uploaded = await this.cloudinaryService.uploadBuffer({
        buffer: originalFile.buffer,
        folder,
        publicId: `m-avatar-${suffix}`,
      });
      return this.messagingProfilesService.updateAvatarForUser({
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
        publicId: `m-original-${suffix}`,
      }),
      this.cloudinaryService.uploadBuffer({
        buffer: croppedFile.buffer,
        folder,
        publicId: `m-avatar-${suffix}`,
      }),
    ]);

    return this.messagingProfilesService.updateAvatarForUser({
      userId: user.userId,
      avatarUrl: cropped.secureUrl,
      avatarOriginalUrl: original.secureUrl,
      avatarPublicId: cropped.publicId,
      avatarOriginalPublicId: original.publicId,
    });
  }

  @Delete('avatar')
  async resetAvatar(@Req() req: Request & { user?: AuthenticatedUser }) {
    const user = req.user;
    if (!user) throw new UnauthorizedException('Unauthorized');
    return this.messagingProfilesService.resetAvatarForUser(user.userId);
  }
}
