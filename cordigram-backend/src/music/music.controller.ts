import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MusicService } from './music.service';

@Controller('music')
@UseGuards(JwtAuthGuard)
export class MusicController {
  constructor(private readonly musicService: MusicService) {}

  @Get('search')
  search(
    @Query('q') q = '',
    @Query('limit') limit = '20',
    @Query('offset') offset = '0',
  ) {
    return this.musicService.searchTracks(q, Number(limit), Number(offset));
  }

  @Get('trending')
  trending(
    @Query('limit') limit = '20',
    @Query('offset') offset = '0',
  ) {
    return this.musicService.getTrendingTracks(Number(limit), Number(offset));
  }
}
