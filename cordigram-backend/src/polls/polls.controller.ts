import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { PollsService } from './polls.service';
import { CreatePollDto, VotePollDto } from './dto/create-poll.dto';
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

  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req) {
    const userId = req.user.userId || req.user.sub;
    await this.pollsService.delete(id, userId);
    return { message: 'Poll deleted successfully' };
  }
}
