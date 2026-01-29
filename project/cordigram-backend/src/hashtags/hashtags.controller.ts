import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import type { Request } from 'express';
import { HashtagsService } from './hashtags.service';

@Controller('hashtags')
export class HashtagsController {
  constructor(private readonly hashtagsService: HashtagsService) {}

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

    const items = await this.hashtagsService.suggest({
      q,
      limit: limit ? Number(limit) : 10,
    });

    return { items, count: items.length };
  }

  @UseGuards(JwtAuthGuard)
  @Get('trending')
  async trending(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Query('limit') limit?: string,
  ) {
    const user = req.user;
    if (!user) throw new UnauthorizedException('Unauthorized');

    const items = await this.hashtagsService.trending({
      limit: limit ? Number(limit) : 15,
    });

    return { items, count: items.length };
  }
}
