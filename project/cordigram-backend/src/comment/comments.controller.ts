import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from '../comment/dto/create-comment.dto';
import { DeleteCommentDto } from './dto/delete-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@Controller('posts/:postId/comments')
@UseGuards(JwtAuthGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  async list(
    @Req() req: Request,
    @Param('postId') postId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('parentId') parentId?: string,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    return this.commentsService.list(user?.userId ?? '', postId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      parentId: parentId || undefined,
    });
  }

  @Post()
  async create(
    @Req() req: Request,
    @Param('postId') postId: string,
    @Body() dto: CreateCommentDto,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    return this.commentsService.create(user?.userId ?? '', postId, dto);
  }

  @Post(':commentId/like')
  async like(
    @Req() req: Request,
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    return this.commentsService.likeComment(
      user?.userId ?? '',
      postId,
      commentId,
    );
  }

  @Delete(':commentId/like')
  async unlike(
    @Req() req: Request,
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    return this.commentsService.unlikeComment(
      user?.userId ?? '',
      postId,
      commentId,
    );
  }

  @Delete(':commentId')
  async delete(
    @Req() req: Request,
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
    @Body() dto: DeleteCommentDto,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    return this.commentsService.deleteComment(
      user?.userId ?? '',
      postId,
      commentId,
      dto,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':commentId')
  async update(
    @Req() req: Request,
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentDto,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    return this.commentsService.updateComment(
      user?.userId ?? '',
      postId,
      commentId,
      dto,
    );
  }
}
