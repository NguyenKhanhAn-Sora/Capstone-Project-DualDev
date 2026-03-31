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

  // ── Categories (MUST be before :id routes) ──

  @Post('categories')
  async createCategory(
    @Param('serverId') serverId: string,
    @Body() body: { name: string; type?: 'text' | 'voice' | 'mixed' },
  ) {
    return this.channelsService.createCategory(serverId, body.name, body.type);
  }

  @Get('categories/list')
  async getCategories(@Param('serverId') serverId: string) {
    return this.channelsService.getCategories(serverId);
  }

  @Patch('categories/:categoryId')
  async updateCategory(
    @Param('categoryId') categoryId: string,
    @Body() body: { name: string },
  ) {
    return this.channelsService.updateCategory(categoryId, body.name);
  }

  @Delete('categories/:categoryId')
  async deleteCategory(@Param('categoryId') categoryId: string) {
    await this.channelsService.deleteCategory(categoryId);
    return { message: 'Category deleted successfully' };
  }

  // ── Reorder (MUST be before :id routes) ──

  @Patch('reorder/categories')
  async reorderCategories(
    @Param('serverId') serverId: string,
    @Body() body: { orderedIds: string[] },
    @Request() req: any,
  ) {
    await this.channelsService.reorderCategories(
      serverId,
      body.orderedIds,
      req.user.userId,
    );
    return { message: 'Categories reordered' };
  }

  @Patch('reorder/channels')
  async reorderChannels(
    @Param('serverId') serverId: string,
    @Body() body: { categoryId: string | null; orderedChannelIds: string[] },
    @Request() req: any,
  ) {
    await this.channelsService.reorderChannels(
      serverId,
      body.categoryId,
      body.orderedChannelIds,
      req.user.userId,
    );
    return { message: 'Channels reordered' };
  }

  // ── Base channel CRUD ──

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
  async deleteChannel(@Param('id') channelId: string, @Request() req: any) {
    await this.channelsService.deleteChannel(channelId, req.user.userId);
    return { message: 'Channel deleted successfully' };
  }
}
