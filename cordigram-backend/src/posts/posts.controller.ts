import {
  BadRequestException,
  Body,
  Controller,
  Patch,
  HttpCode,
  Post,
  ParseBoolPipe,
  Delete,
  Get,
  Param,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
type UploadedFile = {
  buffer: Buffer;
  mimetype: string;
  size?: number;
  originalname?: string;
};
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { UpdateVisibilityDto } from './dto/update-visibility.dto';
import { UpdatePostNotificationMuteDto } from './dto/update-post-notification-mute.dto';
import { PostsService } from './posts.service';
import { ConfigService } from '../config/config.service';
import { JwtService } from '@nestjs/jwt';
import { BoostService, FREE_MAX_UPLOAD_BYTES } from '../boost/boost.service';
import { isCordigramMessagesUpload } from '../common/cordigram-upload-context';

@Controller('posts')
export class PostsController {
  private readonly jwt = new JwtService();

  constructor(
    private readonly postsService: PostsService,
    private readonly config: ConfigService,
    private readonly boostService: BoostService,
  ) {}

  private resolveAdminPreviewViewerId(
    req: Request,
    user: AuthenticatedUser,
    targetUserId: string,
  ): string | null {
    const headerToken = req.headers['x-admin-preview-token'];
    const token =
      typeof headerToken === 'string'
        ? headerToken
        : Array.isArray(headerToken)
          ? headerToken[0]
          : '';
    if (!token) {
      return null;
    }

    try {
      const payload = this.jwt.verify<{
        type?: string;
        adminId?: string;
        targetUserId?: string;
      }>(token, {
        secret: this.config.jwtSecret,
      });

      if (payload?.type !== 'admin_profile_preview') {
        return null;
      }
      if (payload.targetUserId !== targetUserId) {
        return null;
      }

      return payload.targetUserId;
    } catch {
      return null;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Req() req: Request, @Body() dto: CreatePostDto) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.create(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(
    @Req() req: Request,
    @Param('id') postId: string,
    @Body() dto: UpdatePostDto,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.update(user.userId, postId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('batch')
  @HttpCode(200)
  async batchDelete(
    @Req() req: Request,
    @Body('ids') ids: string[] | undefined,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) throw new UnauthorizedException();
    if (!Array.isArray(ids) || !ids.length)
      throw new BadRequestException('ids must be a non-empty array');
    return this.postsService.bulkDeletePosts(user.userId, ids);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') postId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.delete(user.userId, postId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/pin')
  @HttpCode(200)
  async pinPost(@Req() req: Request, @Param('id') postId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) throw new UnauthorizedException();
    return this.postsService.pinPost(user.userId, postId, 'post');
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/pin')
  @HttpCode(200)
  async unpinPost(@Req() req: Request, @Param('id') postId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) throw new UnauthorizedException();
    return this.postsService.unpinPost(user.userId, postId);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('feed')
  async feed(
    @Req() req: Request,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('scope') scope?: string,
    @Query('kinds') kinds?: string,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    const parsedLimit = limit ? Number(limit) : undefined;

    const parsedKinds = kinds
      ? kinds
          .split(',')
          .map((k) => k.trim())
          .filter((k) => k === 'post' || k === 'reel')
      : undefined;

    if (scope === 'following') {
      if (!user) throw new UnauthorizedException();
      return this.postsService.getFollowingFeed(
        user.userId,
        parsedLimit ?? 20,
        (parsedKinds as any) ?? undefined,
        page ? Number(page) : undefined,
      );
    }

    return this.postsService.getFeed(
      user?.userId ?? null,
      parsedLimit ?? 20,
      (parsedKinds as any) ?? undefined,
      page ? Number(page) : undefined,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('saved')
  async saved(@Req() req: Request, @Query('limit') limit?: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.postsService.getSavedPosts(user.userId, parsedLimit ?? 24);
  }

  @UseGuards(JwtAuthGuard)
  @Get('hidden')
  async hidden(@Req() req: Request, @Query('limit') limit?: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    const parsedLimit = limit ? Number(limit) : undefined;
    const items = await this.postsService.getHiddenPosts(
      user.userId,
      parsedLimit ?? 24,
    );
    return { items };
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('hashtag/:tag')
  async listByHashtag(
    @Req() req: Request,
    @Param('tag') tag: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.postsService.getPostsByHashtag({
      viewerId: user?.userId ?? null,
      tag,
      limit: parsedLimit,
      page: page ? Number(page) : undefined,
    });
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('hashtag/:tag/reels')
  async listReelsByHashtag(
    @Req() req: Request,
    @Param('tag') tag: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.postsService.getReelsByHashtag({
      viewerId: user?.userId ?? null,
      tag,
      limit: parsedLimit,
      page: page ? Number(page) : undefined,
    });
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('user/:id')
  async listByUser(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    const parsedLimit = limit ? Number(limit) : undefined;
    const previewViewerId = user ? this.resolveAdminPreviewViewerId(req, user, id) : null;
    return this.postsService.getUserPosts({
      viewerId: previewViewerId ?? user?.userId ?? null,
      targetUserId: id,
      limit: parsedLimit,
    });
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  async getOne(@Req() req: Request, @Param('id') postId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    return this.postsService.getById(user?.userId ?? null, postId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        // Post/reel uploads are capped at FREE_MAX_UPLOAD_BYTES.
        fileSize: FREE_MAX_UPLOAD_BYTES,
      },
    }),
  )
  async uploadMedia(
    @Req() req: Request,
    @UploadedFile() file: UploadedFile | undefined,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    if (!file) {
      throw new BadRequestException('Missing file');
    }
    const status = await this.boostService.getBoostStatus(user.userId);
    const maxBytes = isCordigramMessagesUpload(req)
      ? status.limits.maxUploadBytes
      : FREE_MAX_UPLOAD_BYTES;
    if (typeof file.size === 'number' && file.size > maxBytes) {
      throw new BadRequestException(`File too large (max ${maxBytes} bytes)`);
    }
    if (
      !file.mimetype.startsWith('image/') &&
      !file.mimetype.startsWith('video/') &&
      !file.mimetype.startsWith('audio/')
    ) {
      throw new BadRequestException(
        'Only image, video, or audio files are allowed',
      );
    }
    return this.postsService.uploadMedia(user.userId, file);
  }

  @UseGuards(JwtAuthGuard)
  @Post('upload/batch')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: {
        fileSize: FREE_MAX_UPLOAD_BYTES,
      },
    }),
  )
  async uploadMediaBatch(
    @Req() req: Request,
    @UploadedFiles() files: UploadedFile[] | undefined,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    if (!files || !files.length) {
      throw new BadRequestException('Missing files');
    }
    const status = await this.boostService.getBoostStatus(user.userId);
    const maxBytes = isCordigramMessagesUpload(req)
      ? status.limits.maxUploadBytes
      : FREE_MAX_UPLOAD_BYTES;
    const tooLarge = files.find(
      (f) => typeof f.size === 'number' && f.size > maxBytes,
    );
    if (tooLarge) {
      throw new BadRequestException(`File too large (max ${maxBytes} bytes)`);
    }

    const invalid = files.find(
      (file) =>
        !file.mimetype.startsWith('image/') &&
        !file.mimetype.startsWith('video/') &&
        !file.mimetype.startsWith('audio/'),
    );

    if (invalid) {
      throw new BadRequestException(
        'Only image, video, or audio files are allowed',
      );
    }

    return this.postsService.uploadMediaBatch(user.userId, files);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/like')
  async like(@Req() req: Request, @Param('id') postId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.like(user.userId, postId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/like')
  async unlike(@Req() req: Request, @Param('id') postId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.unlike(user.userId, postId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/likes')
  async listLikes(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Param('id') postId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.listPostLikes({
      viewerId: user.userId,
      postId,
      limit: limit ? Number(limit) : undefined,
      cursor: cursor || undefined,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/save')
  async save(@Req() req: Request, @Param('id') postId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.save(user.userId, postId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/allow-comments')
  @HttpCode(200)
  async setAllowComments(
    @Req() req: Request,
    @Param('id') postId: string,
    @Body('allowComments') allowComments?: boolean,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    if (typeof allowComments !== 'boolean') {
      throw new BadRequestException('allowComments must be a boolean');
    }
    return this.postsService.setAllowComments(
      user.userId,
      postId,
      allowComments,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/hide-like-count')
  @HttpCode(200)
  async setHideLikeCount(
    @Req() req: Request,
    @Param('id') postId: string,
    @Body('hideLikeCount', new ParseBoolPipe()) hideLikeCount: boolean,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return await this.postsService.setHideLikeCount(
      user.userId,
      postId,
      hideLikeCount,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/visibility')
  @HttpCode(200)
  async updateVisibility(
    @Req() req: Request,
    @Param('id') postId: string,
    @Body() dto: UpdateVisibilityDto,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }

    return this.postsService.setVisibility(user.userId, postId, dto.visibility);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/notifications/mute')
  async getNotificationMute(@Req() req: Request, @Param('id') postId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.getNotificationMute(user.userId, postId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/notifications/mute')
  @HttpCode(200)
  async updateNotificationMute(
    @Req() req: Request,
    @Param('id') postId: string,
    @Body() dto: UpdatePostNotificationMuteDto,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.setNotificationMute(user.userId, postId, {
      enabled: dto.enabled,
      mutedIndefinitely: dto.mutedIndefinitely,
      mutedUntil: dto.mutedUntil ?? null,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/save')
  async unsave(@Req() req: Request, @Param('id') postId: string) {
    const user = req.user as AuthenticatedUser | undefined;

    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.unsave(user.userId, postId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/share')
  async share(@Req() req: Request, @Param('id') postId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.share(user.userId, postId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/repost')
  async repost(@Req() req: Request, @Param('id') postId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.repost(user.userId, postId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/repost')
  async unrepost(@Req() req: Request, @Param('id') postId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.unrepost(user.userId, postId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/hide')
  async hide(@Req() req: Request, @Param('id') postId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.hide(user.userId, postId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/hide')
  async unhide(@Req() req: Request, @Param('id') postId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.unhide(user.userId, postId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/report')
  async report(@Req() req: Request, @Param('id') postId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.report(user.userId, postId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/view')
  async view(
    @Req() req: Request,
    @Param('id') postId: string,
    @Body('durationMs') durationMs?: number,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    const parsed =
      typeof durationMs === 'string' ? Number(durationMs) : durationMs;
    return this.postsService.view(user.userId, postId, parsed);
  }
}
