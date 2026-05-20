import {
  Controller,
  Post,
  Patch,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { PollsService } from './polls.service';
import { CreatePollDto, UpdatePollDto, VotePollDto } from './dto/create-poll.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('polls')
@UseGuards(JwtAuthGuard)
export class PollsController {
  constructor(private readonly pollsService: PollsService) {}

  @Post()
  async create(@Request() req, @Body() dto: CreatePollDto) {
    const userId = req.user.userId || req.user.sub;
    return this.pollsService.create(userId, dto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.pollsService.findById(id);
  }

  @Post(':id/vote')
  async vote(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: VotePollDto,
  ) {
    const userId = req.user.userId || req.user.sub;
    return this.pollsService.vote(id, userId, dto);
  }

  @Get(':id/results')
  async getResults(@Param('id') id: string) {
    return this.pollsService.getResults(id);
  }

  @Get(':id/my-vote')
  async getMyVote(@Param('id') id: string, @Request() req) {
    const userId = req.user.userId || req.user.sub;
    return this.pollsService.getUserVote(id, userId);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Request() req, @Body() dto: UpdatePollDto) {
    const userId = req.user.userId || req.user.sub;
    return this.pollsService.update(id, userId, dto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req) {
    const userId = req.user.userId || req.user.sub;
    await this.pollsService.delete(id, userId);
    return { message: 'Poll deleted successfully' };
  }

  @Get(':id/voters')
  async getVoters(
    @Param('id') id: string,
    @Request() req,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const viewerId = req.user?.userId || req.user?.sub || null;
    const pageSize = Math.min(parseInt(limit ?? '20', 10) || 20, 50);
    return this.pollsService.getVoters(id, viewerId, pageSize, cursor);
  }
}
