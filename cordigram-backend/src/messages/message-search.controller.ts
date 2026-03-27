import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessageSearchController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('search')
  async searchMessages(
    @Query('q') q?: string,
    @Query('serverId') serverId?: string,
    @Query('channelId') channelId?: string,
    @Query('senderId') senderId?: string,
    @Query('before') before?: string,
    @Query('after') after?: string,
    @Query('hasFile') hasFile?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
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
    });
  }
}
