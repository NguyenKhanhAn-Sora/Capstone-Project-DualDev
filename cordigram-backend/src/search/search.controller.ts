import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import type { Request } from 'express';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @UseGuards(JwtAuthGuard)
  @Get('suggest')
  async suggest(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    const user = req.user;
    if (!user) throw new UnauthorizedException('Unauthorized');

    if (!q || !q.trim()) throw new BadRequestException('q is required');

    const results = await this.searchService.suggest({
      viewerId: user.userId,
      q,
      limit: limit ? Number(limit) : 10,
    });

    return results;
  }

  @UseGuards(JwtAuthGuard)
  @Get('posts')
  async searchPosts(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('kinds') kinds?: string,
    @Query('sort') sort?: string,
  ) {
    const user = req.user;
    if (!user) throw new UnauthorizedException('Unauthorized');

    if (!q || !q.trim()) throw new BadRequestException('q is required');

    const parsedKinds = kinds
      ? kinds
          .split(',')
          .map((k) => k.trim())
          .filter((k) => k === 'post' || k === 'reel')
      : ['post'];

    return this.searchService.searchPosts({
      viewerId: user.userId,
      q,
      limit: limit ? Number(limit) : 20,
      page: page ? Number(page) : 1,
      kinds: (parsedKinds as any) ?? ['post'],
      sort: sort === 'trending' ? 'trending' : undefined,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('history')
  async getHistory(@Req() req: Request & { user?: AuthenticatedUser }) {
    const user = req.user;
    if (!user) throw new UnauthorizedException('Unauthorized');

    const items = await this.searchService.getHistory({
      viewerId: user.userId,
    });
    return { items, count: items.length };
  }

  @UseGuards(JwtAuthGuard)
  @Post('history')
  async addHistory(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Body() body: any,
  ) {
    const user = req.user;
    if (!user) throw new UnauthorizedException('Unauthorized');

    const item = await this.searchService.addHistory({
      viewerId: user.userId,
      input: body,
    });

    return item;
  }

  @UseGuards(JwtAuthGuard)
  @Delete('history')
  async clearHistory(@Req() req: Request & { user?: AuthenticatedUser }) {
    const user = req.user;
    if (!user) throw new UnauthorizedException('Unauthorized');

    await this.searchService.clearHistory({ viewerId: user.userId });
    return { cleared: true };
  }

  @UseGuards(JwtAuthGuard)
  @Delete('history/:id')
  async deleteHistoryItem(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Param('id') itemId: string,
  ) {
    const user = req.user;
    if (!user) throw new UnauthorizedException('Unauthorized');

    if (!itemId || !itemId.trim()) {
      throw new BadRequestException('id is required');
    }

    await this.searchService.deleteHistoryItem({
      viewerId: user.userId,
      itemId,
    });

    return { deleted: true };
  }
}
