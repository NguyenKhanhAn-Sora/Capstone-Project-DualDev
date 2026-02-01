import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DirectMessagesService } from './direct-messages.service';
import {
  CreateDirectMessageDto,
  MarkAsReadDto,
} from './dto/create-direct-message.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('direct-messages')
@UseGuards(JwtAuthGuard)
export class DirectMessagesController {
  constructor(private readonly directMessagesService: DirectMessagesService) {}

  @Post(':receiverId')
  async createDirectMessage(
    @Param('receiverId') receiverId: string,
    @Body() createDirectMessageDto: CreateDirectMessageDto,
    @CurrentUser() user: any,
  ) {
    const message = await this.directMessagesService.createDirectMessage(
      user.userId,
      receiverId,
      createDirectMessageDto,
    );

    // Populate sender and receiver info
    return this.directMessagesService.getDirectMessageById(
      message._id.toString(),
    );
  }

  @Get('conversation/:userId')
  async getConversation(
    @Param('userId') userId: string,
    @CurrentUser() user: any,
    @Query('limit') limit?: number,
    @Query('skip') skip?: number,
  ) {
    if (!userId || userId === 'undefined') {
      return [];
    }

    const messages = await this.directMessagesService.getConversation(
      user.userId,
      userId,
      limit ? parseInt(limit.toString()) : 50,
      skip ? parseInt(skip.toString()) : 0,
    );

    return messages.reverse();
  }

  @Get('conversations')
  async getConversationList(@CurrentUser() user: any) {
    return this.directMessagesService.getConversationList(user.userId);
  }

  @Get('unread/count')
  async getUnreadCount(@CurrentUser() user: any) {
    const count = await this.directMessagesService.getUnreadCount(user.userId);
    return { unreadCount: count };
  }

  @Get('unread/:userId')
  async getUnreadCountByUser(
    @Param('userId') userId: string,
    @CurrentUser() user: any,
  ) {
    const count = await this.directMessagesService.getUnreadCountByUser(
      user.userId,
      userId,
    );
    return { unreadCount: count };
  }

  @Patch(':messageId')
  async updateDirectMessage(
    @Param('messageId') messageId: string,
    @Body() updateDirectMessageDto: any,
    @CurrentUser() user: any,
  ) {
    const message = await this.directMessagesService.updateDirectMessage(
      messageId,
      user.userId,
      updateDirectMessageDto,
    );

    return this.directMessagesService.getDirectMessageById(
      message._id.toString(),
    );
  }

  @Delete(':messageId')
  async deleteDirectMessage(
    @Param('messageId') messageId: string,
    @CurrentUser() user: any,
  ) {
    await this.directMessagesService.deleteDirectMessage(
      messageId,
      user.userId,
    );
    return { deleted: true };
  }

  @Post(':messageId/reaction/:emoji')
  async addReaction(
    @Param('messageId') messageId: string,
    @Param('emoji') emoji: string,
    @CurrentUser() user: any,
  ) {
    const message = await this.directMessagesService.addReaction(
      messageId,
      emoji,
      user.userId,
    );

    return this.directMessagesService.getDirectMessageById(
      message._id.toString(),
    );
  }

  @Get('available-users/list')
  async getAvailableUsers(@CurrentUser() user: any) {
    return this.directMessagesService.getAvailableUsers(user.userId);
  }
}
