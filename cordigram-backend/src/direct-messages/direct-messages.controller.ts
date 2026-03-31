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
import { DirectMessagesGateway } from './direct-messages.gateway';
import {
  CreateDirectMessageDto,
  MarkAsReadDto,
} from './dto/create-direct-message.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('direct-messages')
@UseGuards(JwtAuthGuard)
export class DirectMessagesController {
  constructor(
    private readonly directMessagesService: DirectMessagesService,
    private readonly directMessagesGateway: DirectMessagesGateway,
  ) {}

  @Get('search')
  async searchDirectMessages(
    @CurrentUser() user: any,
    @Query('q') q?: string,
    @Query('userId') otherUserId?: string,
    @Query('before') before?: string,
    @Query('after') after?: string,
    @Query('hasFile') hasFile?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.directMessagesService.searchDirectMessages(user.userId, {
      q,
      otherUserId,
      before,
      after,
      hasFile: hasFile === 'true',
      limit: limit ? parseInt(limit, 10) : 25,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

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
    const populated = await this.directMessagesService.getDirectMessageById(
      message._id.toString(),
    );

    // Emit realtime to receiver (REST send should behave like websocket send-message)
    try {
      this.directMessagesGateway.emitNewDirectMessageFromRest({
        senderId: user.userId,
        receiverId,
        message: populated,
      });
    } catch (e) {
      // ignore socket emit errors
    }

    return populated;
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

  @Post('conversation/:userId/read')
  async markConversationAsRead(
    @Param('userId') fromUserId: string,
    @CurrentUser() user: any,
  ) {
    await this.directMessagesService.markConversationAsRead(
      user.userId,
      fromUserId,
    );
    // Best-effort: push realtime unread update to this user
    try {
      const socketId = this.directMessagesGateway.getSocketIdByUserId(
        user.userId,
      );
      if (socketId) {
        const count = await this.directMessagesService.getUnreadCount(
          user.userId,
        );
        (this.directMessagesGateway as any).server
          ?.to(socketId)
          ?.emit?.('dm-unread-count', {
            totalUnread: count,
            fromUserId,
            conversationUnread: 0,
          });
      }
    } catch (_e) {}
    return { success: true };
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

    const populated = await this.directMessagesService.getDirectMessageById(
      message._id.toString(),
    );

    // Emit realtime update to both sender + receiver so both UIs update without reload
    try {
      const senderId =
        (populated as any).senderId?._id?.toString?.() ||
        (populated as any).senderId?.toString?.();
      const receiverId =
        (populated as any).receiverId?._id?.toString?.() ||
        (populated as any).receiverId?.toString?.();
      if (senderId && receiverId) {
        this.directMessagesGateway.emitReactionUpdate({
          messageId: (populated as any)._id?.toString?.() || messageId,
          senderId,
          receiverId,
          reactions: (populated as any).reactions || [],
        });
      }
    } catch (e) {
      // don't fail request if socket emit fails
    }

    return populated;
  }

  @Get('available-users/list')
  async getAvailableUsers(@CurrentUser() user: any) {
    return this.directMessagesService.getAvailableUsers(user.userId);
  }
}
