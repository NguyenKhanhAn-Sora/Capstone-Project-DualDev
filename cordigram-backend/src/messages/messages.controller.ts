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
import { ChannelMessagesGateway } from './channel-messages.gateway';
import { CreateMessageDto } from './dto/create-message.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('channels/:channelId/messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly channelMessagesGateway: ChannelMessagesGateway,
  ) {}

  @Post()
  async createMessage(
    @Param('channelId') channelId: string,
    @Body() createMessageDto: CreateMessageDto,
    @Request() req: any,
  ) {
    const result = await this.messagesService.createMessage(
      channelId,
      createMessageDto,
      req.user.userId,
    );
    this.channelMessagesGateway.emitNewMessage(channelId, result);
    return result;
  }

  @Get()
  async getMessages(
    @Param('channelId') channelId: string,
    @Query('limit') limit: number = 50,
    @Query('skip') skip: number = 0,
    @Request() req: any,
  ) {
    const viewerId = req.user?.userId;
    return this.messagesService.getMessagesByChannelId(channelId, limit, skip, viewerId);
  }

  @Post('read')
  async markChannelAsRead(
    @Param('channelId') channelId: string,
    @Request() req: any,
  ) {
    await this.messagesService.markChannelAsRead(req.user.userId, channelId);
    return { success: true };
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
  async deleteMessage(@Param('id') messageId: string, @Request() req: any) {
    await this.messagesService.deleteMessage(messageId, req.user.userId);
    return { message: 'Message deleted successfully' };
  }

  @Post(':id/reactions/:emoji')
  async addReaction(
    @Param('channelId') channelId: string,
    @Param('id') messageId: string,
    @Param('emoji') emoji: string,
    @Request() req: any,
  ) {
    const updated = await this.messagesService.addReaction(
      messageId,
      emoji,
      req.user.userId,
    );
    const chId =
      channelId ||
      (updated?.channelId && typeof updated.channelId === 'object'
        ? (updated.channelId as any)._id?.toString()
        : updated?.channelId?.toString());
    if (chId && updated?.reactions) {
      this.channelMessagesGateway.emitReactionUpdate(
        chId,
        messageId,
        updated.reactions,
      );
    }
    return updated;
  }
}
