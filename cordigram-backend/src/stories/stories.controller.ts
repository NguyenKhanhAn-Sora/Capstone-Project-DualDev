import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { StoriesService } from './stories.service';
import { CreateStoryDto } from './dto/create-story.dto';

type UploadedFile = {
  buffer: Buffer;
  mimetype: string;
  size?: number;
  originalname?: string;
};

const STORY_MAX_BYTES = 100 * 1024 * 1024; // 100 MB

@Controller('stories')
export class StoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  @UseGuards(JwtAuthGuard)
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: STORY_MAX_BYTES } }))
  async uploadMedia(
    @Req() req: Request,
    @UploadedFile() file: UploadedFile | undefined,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) throw new UnauthorizedException();
    if (!file) throw new BadRequestException('Missing file');
    if (!file.mimetype.startsWith('image/') && !file.mimetype.startsWith('video/')) {
      throw new BadRequestException('Only image or video files are allowed');
    }
    return this.storiesService.uploadStoryMedia(user.userId, file);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Req() req: Request, @Body() dto: CreateStoryDto) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) throw new UnauthorizedException();
    return this.storiesService.createStory(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') storyId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) throw new UnauthorizedException();
    return this.storiesService.deleteStory(user.userId, storyId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/visibility')
  @HttpCode(200)
  async updateVisibility(
    @Req() req: Request,
    @Param('id') storyId: string,
    @Body('visibility') visibility: string,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) throw new UnauthorizedException();
    if (!['public', 'followers', 'private'].includes(visibility)) {
      throw new BadRequestException('visibility must be public, followers, or private');
    }
    return this.storiesService.updateVisibility(
      user.userId,
      storyId,
      visibility as 'public' | 'followers' | 'private',
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('feed')
  async feed(@Req() req: Request) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) throw new UnauthorizedException();
    return this.storiesService.getFeed(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my')
  async my(@Req() req: Request) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) throw new UnauthorizedException();
    return this.storiesService.getMyStories(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/view')
  @HttpCode(200)
  async markViewed(@Req() req: Request, @Param('id') storyId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) throw new UnauthorizedException();
    return this.storiesService.markViewed(user.userId, storyId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/viewers')
  async viewers(@Req() req: Request, @Param('id') storyId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) throw new UnauthorizedException();
    return this.storiesService.getViewers(user.userId, storyId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/react')
  @HttpCode(200)
  async react(
    @Req() req: Request,
    @Param('id') storyId: string,
    @Body('emoji') emoji: string,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) throw new UnauthorizedException();
    if (!emoji || typeof emoji !== 'string') throw new BadRequestException('emoji is required');
    return this.storiesService.reactToStory(user.userId, storyId, emoji);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/react')
  @HttpCode(200)
  async unreact(@Req() req: Request, @Param('id') storyId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) throw new UnauthorizedException();
    return this.storiesService.removeReaction(user.userId, storyId);
  }
}
