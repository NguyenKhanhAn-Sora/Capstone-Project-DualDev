import {
  BadRequestException,
  Body,
  Controller,
  Get,
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
import { PostsService } from '../posts/posts.service';

@Controller('explore')
export class ExploreController {
  constructor(private readonly postsService: PostsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  async list(
    @Req() req: Request,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('kinds') kinds?: string,
  ) {
    const user = req.user as AuthenticatedUser | undefined;

    const parsedLimit = limit ? Number(limit) : undefined;
    const parsedPage = page ? Number(page) : undefined;

    const parsedKinds = kinds
      ? kinds
          .split(',')
          .map((k) => k.trim())
          .filter((k) => k === 'post' || k === 'reel')
      : undefined;

    return (this.postsService as unknown as any).getExploreFeed(
      user?.userId ?? null,
      parsedLimit ?? 30,
      parsedPage ?? 1,
      (parsedKinds as any) ?? undefined,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('impression')
  async impression(
    @Req() req: Request,
    @Body()
    body: {
      postId?: string;
      sessionId?: string;
      position?: number | null;
      source?: string;
    },
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }

    const postId = body?.postId?.toString?.() ?? '';
    const sessionId = body?.sessionId?.toString?.() ?? '';
    if (!postId || !sessionId) {
      throw new BadRequestException('Missing postId or sessionId');
    }

    return (this.postsService as unknown as any).recordImpression(
      user.userId,
      postId,
      {
        sessionId,
        position:
          typeof body.position === 'number'
            ? body.position
            : (body.position ?? null),
        source: body?.source?.toString?.() || 'explore',
      },
    );
  }
}
