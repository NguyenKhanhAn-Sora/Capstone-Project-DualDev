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
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { UpdateVisibilityDto } from './dto/update-visibility.dto';
import { PostsService } from './posts.service';

@Controller('posts')
@UseGuards(JwtAuthGuard)
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post()
  async create(@Req() req: Request, @Body() dto: CreatePostDto) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.create(user.userId, dto);
  }

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

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') postId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.delete(user.userId, postId);
  }

  @Get('feed')
  async feed(
    @Req() req: Request,
    @Query('limit') limit?: string,
    @Query('scope') scope?: string,
    @Query('kinds') kinds?: string,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    const parsedLimit = limit ? Number(limit) : undefined;

    const parsedKinds = kinds
      ? kinds
          .split(',')
          .map((k) => k.trim())
          .filter((k) => k === 'post' || k === 'reel')
      : undefined;

    if (scope === 'following') {
      return this.postsService.getFollowingFeed(
        user.userId,
        parsedLimit ?? 20,
        (parsedKinds as any) ?? undefined,
      );
    }

    return this.postsService.getFeed(
      user.userId,
      parsedLimit ?? 20,
      (parsedKinds as any) ?? undefined,
    );
  }

  @Get('saved')
  async saved(@Req() req: Request, @Query('limit') limit?: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.postsService.getSavedPosts(user.userId, parsedLimit ?? 24);
  }

  @Get('hashtag/:tag')
  async listByHashtag(
    @Req() req: Request,
    @Param('tag') tag: string,
    @Query('limit') limit?: string,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.postsService.getPostsByHashtag({
      viewerId: user.userId,
      tag,
      limit: parsedLimit,
    });
  }

  @Get('hashtag/:tag/reels')
  async listReelsByHashtag(
    @Req() req: Request,
    @Param('tag') tag: string,
    @Query('limit') limit?: string,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.postsService.getReelsByHashtag({
      viewerId: user.userId,
      tag,
      limit: parsedLimit,
    });
  }

  @Get('user/:id')
  async listByUser(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.postsService.getUserPosts({
      viewerId: user.userId,
      targetUserId: id,
      limit: parsedLimit,
    });
  }

  @Get(':id')
  async getOne(@Req() req: Request, @Param('id') postId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.getById(user.userId, postId);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: Number(
          process.env.CLOUDINARY_MAX_FILE_SIZE ?? 15 * 1024 * 1024,
        ),
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
    if (
      !file.mimetype.startsWith('image/') &&
      !file.mimetype.startsWith('video/')
    ) {
      throw new BadRequestException('Only image or video files are allowed');
    }
    return this.postsService.uploadMedia(user.userId, file);
  }

  @Post('upload/batch')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: {
        fileSize: Number(
          process.env.CLOUDINARY_MAX_FILE_SIZE ?? 15 * 1024 * 1024,
        ),
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

    const invalid = files.find(
      (file) =>
        !file.mimetype.startsWith('image/') &&
        !file.mimetype.startsWith('video/'),
    );

    if (invalid) {
      throw new BadRequestException('Only image or video files are allowed');
    }

    return this.postsService.uploadMediaBatch(user.userId, files);
  }

  @Post(':id/like')
  async like(@Req() req: Request, @Param('id') postId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.like(user.userId, postId);
  }

  @Delete(':id/like')
  async unlike(@Req() req: Request, @Param('id') postId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.unlike(user.userId, postId);
  }

  @Post(':id/save')
  async save(@Req() req: Request, @Param('id') postId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.save(user.userId, postId);
  }

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

  @Delete(':id/save')
  async unsave(@Req() req: Request, @Param('id') postId: string) {
    const user = req.user as AuthenticatedUser | undefined;

    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.unsave(user.userId, postId);
  }

  @Post(':id/share')
  async share(@Req() req: Request, @Param('id') postId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.share(user.userId, postId);
  }

  @Post(':id/repost')
  async repost(@Req() req: Request, @Param('id') postId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.repost(user.userId, postId);
  }

  @Delete(':id/repost')
  async unrepost(@Req() req: Request, @Param('id') postId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.unrepost(user.userId, postId);
  }

  @Post(':id/hide')
  async hide(@Req() req: Request, @Param('id') postId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.hide(user.userId, postId);
  }

  @Post(':id/report')
  async report(@Req() req: Request, @Param('id') postId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.report(user.userId, postId);
  }

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
