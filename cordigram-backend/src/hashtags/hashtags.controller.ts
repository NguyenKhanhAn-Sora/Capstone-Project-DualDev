import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { HashtagsService } from './hashtags.service';

@Controller('hashtags')
export class HashtagsController {
  constructor(private readonly hashtagsService: HashtagsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get('suggest')
  async suggest(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    if (!q || !q.trim()) throw new BadRequestException('q is required');

    const items = await this.hashtagsService.suggest({
      q,
      limit: limit ? Number(limit) : 10,
    });

    return { items, count: items.length };
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('trending')
  async trending(@Query('limit') limit?: string) {
    const items = await this.hashtagsService.trending({
      limit: limit ? Number(limit) : 15,
    });

    return { items, count: items.length };
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('search')
  async search(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    if (!q || !q.trim()) throw new BadRequestException('q is required');

    return this.hashtagsService.search({
      q,
      limit: limit ? Number(limit) : 20,
      page: page ? Number(page) : 1,
    });
  }
}
