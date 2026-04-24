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
  HttpCode,
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
    @Query('fuzzy') fuzzy?: string,
    @Query('parseQuery') parseQuery?: string,
  ) {
    return this.directMessagesService.searchDirectMessages(user.userId, {
      q,
      otherUserId,
      before,
      after,
      hasFile: hasFile === 'true',
      limit: limit ? parseInt(limit, 10) : 25,
      offset: offset ? parseInt(offset, 10) : 0,
      fuzzy: fuzzy === 'true' || fuzzy === '1',
      parseQuery: parseQuery === 'false' || parseQuery === '0' ? false : true,
    });
  }

  /**
   * POST variants for delete — some proxies / hosts mishandle DELETE or strip
   * bodies; the web client uses these as the primary transport.
   * Registered before `@Post(':receiverId')` so paths are not captured as a receiver id.
   */
  @Post(':messageId/delete-for-everyone')
  @HttpCode(200)
  async deleteDirectMessageForEveryonePost(
    @Param('messageId') messageId: string,
    @CurrentUser() user: any,
  ) {
    return this.performDeleteForEveryone(messageId, user);
  }

  @Post(':messageId/delete-for-me')
  @HttpCode(200)
  async deleteDirectMessageForMePost(
    @Param('messageId') messageId: string,
    @CurrentUser() user: any,
  ) {
    return this.performDeleteForMe(messageId, user);
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

  // Register these *before* `@Delete(':messageId')` so paths like
  // `/direct-messages/…/for-everyone` are never mis-handled in edge setups.
  @Delete(':messageId/for-everyone')
  async deleteDirectMessageForEveryone(
    @Param('messageId') messageId: string,
    @CurrentUser() user: any,
  ) {
    return this.performDeleteForEveryone(messageId, user);
  }

  @Delete(':messageId/for-me')
  async deleteDirectMessageForMe(
    @Param('messageId') messageId: string,
    @CurrentUser() user: any,
  ) {
    return this.performDeleteForMe(messageId, user);
  }

  @Delete(':messageId')
  async deleteDirectMessage(
    @Param('messageId') messageId: string,
    @CurrentUser() user: any,
    @Body() body?: { deleteType?: 'for-everyone' | 'for-me' },
    @Query('deleteType') deleteTypeQuery?: 'for-everyone' | 'for-me',
  ) {
    // Accept deleteType from body (preferred) or query string so older clients
    // that put the flag in the URL still work.
    const requested = body?.deleteType || deleteTypeQuery;
    const deleteType: 'for-everyone' | 'for-me' =
      requested === 'for-everyone' ? 'for-everyone' : 'for-me';

    const result = await this.directMessagesService.deleteDirectMessage(
      messageId,
      user.userId,
      deleteType,
    );

    // Realtime: broadcast unsend so every connected client (sender +
    // receiver) can update their bubble without a refresh. "for-me" stays
    // local to the current device — we only need a broadcast for the
    // "everyone" case.
    try {
      if (result.deleteType === 'for-everyone') {
        this.directMessagesGateway.emitMessageDeleted({
          messageId: result.messageId,
          senderId: result.senderId,
          receiverId: result.receiverId,
          deleteType: 'for-everyone',
          deletedAt: this.deletedAtToIsoString(result.deletedAt),
        });
      }
    } catch (_e) {
      // Don't fail the REST request if the socket emit fails.
    }

    return {
      deleted: true,
      deleteType: result.deleteType,
      deletedAt: result.deletedAt,
      messageId: result.messageId,
    };
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

  private deletedAtToIsoString(deletedAt: Date | string | null | undefined): string {
    if (deletedAt instanceof Date) {
      return deletedAt.toISOString();
    }
    if (typeof deletedAt === 'string' && deletedAt.length > 0) {
      return new Date(deletedAt).toISOString();
    }
    return new Date().toISOString();
  }

  private async performDeleteForEveryone(messageId: string, user: any) {
    const result = await this.directMessagesService.deleteDirectMessage(
      messageId,
      user.userId,
      'for-everyone',
    );
    try {
      this.directMessagesGateway.emitMessageDeleted({
        messageId: result.messageId,
        senderId: result.senderId,
        receiverId: result.receiverId,
        deleteType: 'for-everyone',
        deletedAt: this.deletedAtToIsoString(result.deletedAt),
      });
    } catch (_e) {
      // ignore
    }
    return {
      deleted: true,
      deleteType: result.deleteType,
      deletedAt: result.deletedAt,
      messageId: result.messageId,
    };
  }

  private async performDeleteForMe(messageId: string, user: any) {
    const result = await this.directMessagesService.deleteDirectMessage(
      messageId,
      user.userId,
      'for-me',
    );
    return {
      deleted: true,
      deleteType: result.deleteType,
      deletedAt: result.deletedAt,
      messageId: result.messageId,
    };
  }
}
