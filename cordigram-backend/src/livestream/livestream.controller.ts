import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { LivestreamService } from './livestream.service';
import { CreateLivestreamDto } from './dto/create-livestream.dto';
import { JoinLivestreamDto } from './dto/join-livestream.dto';
import { UpdateLivestreamDto } from './dto/update-livestream.dto';

@Controller('livestreams')
@UseGuards(JwtAuthGuard)
export class LivestreamController {
  constructor(private readonly livestreamService: LivestreamService) {}

  @Get('live')
  async listLive() {
    return this.livestreamService.listLive();
  }

  @Post()
  async create(
    @Body() dto: CreateLivestreamDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.livestreamService.create(user.userId, dto);
  }

  @Post(':id/join-token')
  async joinToken(
    @Param('id') streamId: string,
    @Body() dto: JoinLivestreamDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.livestreamService.joinToken(streamId, user, {
      asHost: dto.asHost,
      participantName: dto.participantName,
    });
  }

  @Get(':id')
  async getById(@Param('id') streamId: string) {
    return this.livestreamService.getById(streamId);
  }

  @Get(':id/ivs-ingest')
  async getIvsIngest(
    @Param('id') streamId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.livestreamService.getIvsIngest(streamId, user.userId);
  }

  @Patch(':id')
  async update(
    @Param('id') streamId: string,
    @Body() dto: UpdateLivestreamDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.livestreamService.updateLiveSettings(streamId, user.userId, dto);
  }

  @Post(':id/end')
  async end(
    @Param('id') streamId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.livestreamService.end(streamId, user.userId);
  }
}
