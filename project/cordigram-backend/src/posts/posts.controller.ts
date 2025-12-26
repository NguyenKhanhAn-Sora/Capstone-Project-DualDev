import {
  BadRequestException,
  Body,
  Controller,
  Post,
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
}
