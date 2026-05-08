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
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import type { Request } from 'express';
import { SearchService } from './search.service';
import { MessagesService } from '../messages/messages.service';
import { DirectMessagesService } from '../direct-messages/direct-messages.service';

@Controller('search')
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly messagesService: MessagesService,
    private readonly directMessagesService: DirectMessagesService,
  ) {}

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
  @Get('messages')
  async searchChannelOrDmMessages(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Query('q') q?: string,
    @Query('serverId') serverId?: string,
    @Query('channelId') channelId?: string,
    @Query('senderId') senderId?: string,
    @Query('before') before?: string,
    @Query('after') after?: string,
    @Query('hasFile') hasFile?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('fuzzy') fuzzy?: string,
    @Query('parseQuery') parseQuery?: string,
    @Query('dm') dm?: string,
    @Query('partnerUserId') partnerUserId?: string,
  ) {
    const user = req.user;
    if (!user) throw new UnauthorizedException('Unauthorized');

    const isDm = dm === 'true' || dm === '1';
    if (isDm) {
      if (!q && !partnerUserId) {
        throw new BadRequestException(
          'For DM search, at least one of q or partnerUserId is required',
        );
      }
      return this.directMessagesService.searchDirectMessages(user.userId, {
        q,
        otherUserId: partnerUserId,
        before,
        after,
        hasFile: hasFile === 'true',
        limit: limit ? parseInt(limit, 10) : 25,
        offset: offset ? parseInt(offset, 10) : 0,
        fuzzy: fuzzy === 'true' || fuzzy === '1',
        parseQuery: parseQuery === 'false' || parseQuery === '0' ? false : true,
      });
    }

    if (!q && !serverId && !channelId && !senderId) {
      throw new BadRequestException(
        'At least one of q, serverId, channelId, or senderId is required',
      );
    }

    return this.messagesService.searchMessages({
      q,
      serverId,
      channelId,
      senderId,
      before,
      after,
      hasFile: hasFile === 'true',
      limit: limit ? parseInt(limit, 10) : 25,
      offset: offset ? parseInt(offset, 10) : 0,
      fuzzy: fuzzy === 'true' || fuzzy === '1',
      parseQuery: parseQuery === 'false' || parseQuery === '0' ? false : true,
    });
  }

  @UseGuards(OptionalJwtAuthGuard)
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

    if (!q || !q.trim()) throw new BadRequestException('q is required');

    const parsedKinds = kinds
      ? kinds
          .split(',')
          .map((k) => k.trim())
          .filter((k) => k === 'post' || k === 'reel')
      : ['post'];

    return this.searchService.searchPosts({
      viewerId: user?.userId ?? null,
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
