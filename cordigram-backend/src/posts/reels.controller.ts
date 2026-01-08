import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreateReelDto } from './dto/create-reel.dto';
import { PostsService } from './posts.service';

@Controller('reels')
@UseGuards(JwtAuthGuard)
export class ReelsController {
  constructor(private readonly postsService: PostsService) {}

  @Post()
  async create(@Req() req: Request, @Body() dto: CreateReelDto) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.createReel(user.userId, dto);
  }

  @Get('feed')
  async feed(@Req() req: Request, @Query('limit') limit?: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.postsService.getReelsFeed(user.userId, parsedLimit ?? 20);
  }

  @Get(':id')
  async getOne(@Req() req: Request, @Param('id') reelId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.postsService.getReelById(user.userId, reelId);
  }

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
}
