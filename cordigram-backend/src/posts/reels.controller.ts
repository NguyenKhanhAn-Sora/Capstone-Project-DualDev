import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreateReelDto } from './dto/create-reel.dto';
import { PostsService } from './posts.service';
import { ConfigService } from '../config/config.service';
import { JwtService } from '@nestjs/jwt';

@Controller('reels')
export class ReelsController {
  private readonly jwt = new JwtService();

  constructor(
    private readonly postsService: PostsService,
    private readonly config: ConfigService,
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
  async create(@Req() req: Request, @Body() dto: CreateReelDto) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.createReel(user.userId, dto);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('feed')
  async feed(
    @Req() req: Request,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('scope') scope?: string,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    const parsedLimit = limit ? Number(limit) : undefined;
    if (scope === 'following') {
      if (!user) throw new UnauthorizedException();
      return this.postsService.getFollowingFeed(
        user.userId,
        parsedLimit ?? 20,
        ['reel'],
        page ? Number(page) : undefined,
      );
    }
    return this.postsService.getReelsFeed(
      user?.userId ?? null,
      parsedLimit ?? 20,
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
    return this.postsService.getSavedReels(user.userId, parsedLimit ?? 24);
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
    return this.postsService.getUserReels({
      viewerId: previewViewerId ?? user?.userId ?? null,
      targetUserId: id,
      limit: parsedLimit,
    });
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  async getOne(@Req() req: Request, @Param('id') reelId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    return this.postsService.getReelById(user?.userId ?? null, reelId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/view')
  async view(
    @Req() req: Request,
    @Param('id') reelId: string,
    @Body('durationMs') durationMs?: number,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    const parsedDuration =
      typeof durationMs === 'string' ? Number(durationMs) : durationMs;
    return this.postsService.view(user.userId, reelId, parsedDuration);
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
  @Post(':id/pin')
  @HttpCode(200)
  async pinReel(@Req() req: Request, @Param('id') reelId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) throw new UnauthorizedException();
    return this.postsService.pinPost(user.userId, reelId, 'reel');
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/pin')
  @HttpCode(200)
  async unpinReel(@Req() req: Request, @Param('id') reelId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) throw new UnauthorizedException();
    return this.postsService.unpinPost(user.userId, reelId);
  }
}
