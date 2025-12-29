import {
  BadRequestException,
  Body,
  Controller,
  Post,
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

  @Get('feed')
  async feed(@Req() req: Request, @Query('limit') limit?: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.postsService.getFeed(user.userId, parsedLimit ?? 20);
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
