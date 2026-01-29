import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('servers/:serverId/channels')
@UseGuards(JwtAuthGuard)
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Post()
  async createChannel(
    @Param('serverId') serverId: string,
    @Body() createChannelDto: CreateChannelDto,
    @Request() req: any,
  ) {
    return this.channelsService.createChannel(
      serverId,
      createChannelDto,
      req.user.userId,
    );
  }

  @Get()
  async getChannels(
    @Param('serverId') serverId: string,
    @Query('type') type?: 'text' | 'voice',
  ) {
    if (type) {
      return this.channelsService.getChannelsByType(serverId, type);
    }
    return this.channelsService.getChannelsByServerId(serverId);
  }

  @Get(':id')
  async getChannel(@Param('id') channelId: string) {
    return this.channelsService.getChannelById(channelId);
  }

  @Patch(':id')
  async updateChannel(
    @Param('id') channelId: string,
    @Body() updateData: { name?: string; description?: string },
    @Request() req: any,
  ) {
    return this.channelsService.updateChannel(
      channelId,
      updateData.name,
      updateData.description,
      req.user.userId,
    );
  }

  @Delete(':id')
  async deleteChannel(
    @Param('id') channelId: string,
    @Request() req: any,
  ) {
    await this.channelsService.deleteChannel(channelId, req.user.userId);
    return { message: 'Channel deleted successfully' };
  }
}
