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
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('channels/:channelId/messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  async createMessage(
    @Param('channelId') channelId: string,
    @Body() createMessageDto: CreateMessageDto,
    @Request() req: any,
  ) {
    return this.messagesService.createMessage(
      channelId,
      createMessageDto,
      req.user.userId,
    );
  }

  @Get()
  async getMessages(
    @Param('channelId') channelId: string,
    @Query('limit') limit: number = 50,
    @Query('skip') skip: number = 0,
  ) {
    return this.messagesService.getMessagesByChannelId(
      channelId,
      limit,
      skip,
    );
  }

  @Get(':id')
  async getMessage(@Param('id') messageId: string) {
    return this.messagesService.getMessageById(messageId);
  }

  @Patch(':id')
  async updateMessage(
    @Param('id') messageId: string,
    @Body() updateData: { content: string },
    @Request() req: any,
  ) {
    return this.messagesService.updateMessage(
      messageId,
      updateData.content,
      req.user.userId,
    );
  }

  @Delete(':id')
  async deleteMessage(
    @Param('id') messageId: string,
    @Request() req: any,
  ) {
    await this.messagesService.deleteMessage(messageId, req.user.userId);
    return { message: 'Message deleted successfully' };
  }

  @Post(':id/reactions/:emoji')
  async addReaction(
    @Param('id') messageId: string,
    @Param('emoji') emoji: string,
    @Request() req: any,
  ) {
    return this.messagesService.addReaction(messageId, emoji, req.user.userId);
  }
}
