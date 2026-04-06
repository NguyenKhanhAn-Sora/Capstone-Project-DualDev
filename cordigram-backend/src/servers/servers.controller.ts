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
  BadRequestException,
} from '@nestjs/common';
import { ServersService } from './servers.service';
import { ServerAccessService } from '../access/server-access.service';
import { CreateServerDto } from './dto/create-server.dto';
import { UpdateServerDto } from './dto/update-server.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('servers')
@UseGuards(JwtAuthGuard)
export class ServersController {
  constructor(
    private readonly serversService: ServersService,
    private readonly serverAccessService: ServerAccessService,
  ) {}

  @Post()
  async createServer(
    @Body() createServerDto: CreateServerDto,
    @Request() req: any,
  ) {
    return this.serversService.createServer(createServerDto, req.user.userId);
  }

  @Get()
  async getMyServers(@Request() req: any) {
    return this.serversService.getServersByUserId(req.user.userId);
  }

  /**
   * Lấy danh sách thành viên (chỉ owner - API cũ)
   */
  @Get(':id/mentions')
  async getMentionSuggestions(
    @Param('id') serverId: string,
    @Query('keyword') keyword: string = '',
    @Request() req: any,
  ) {
    return this.serversService.getMentionSuggestions(
      serverId,
      req.user.userId,
      keyword,
    );
  }

  @Get(':id/members')
  async getServerMembers(@Param('id') serverId: string, @Request() req: any) {
    return this.serversService.getServerMembers(serverId, req.user.userId);
  }

  /**
   * Lấy danh sách thành viên với thông tin role (PUBLIC - cho tất cả members)
   * Trả về members với role info + quyền của user hiện tại
   */
  @Get(':id/members-with-roles')
  async getServerMembersWithRoles(
    @Param('id') serverId: string,
    @Request() req: any,
  ) {
    return this.serversService.getServerMembersWithRoles(
      serverId,
      req.user.userId,
    );
  }

  // =====================================================
  // MODERATOR VIEW
  // =====================================================

  /**
   * Moderator View: danh sách thành viên mở rộng cho bảng
   * GET /servers/:id/mod-view/members
   */
  @Get(':id/mod-view/members')
  async getModeratorMembers(
    @Param('id') serverId: string,
    @Request() req: any,
  ) {
    return this.serversService.getModeratorMembersSummary(
      serverId,
      req.user.userId,
    );
  }

  /**
   * Moderator View: chi tiết 1 thành viên cho panel bên phải
   * GET /servers/:id/mod-view/members/:memberId
   */
  @Get(':id/mod-view/members/:memberId')
  async getModeratorMemberDetail(
    @Param('id') serverId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
  ) {
    return this.serversService.getModeratorMemberDetail(
      serverId,
      memberId,
      req.user.userId,
    );
  }

  /**
   * Lấy permissions của user hiện tại trong server
   * GET /servers/:id/my-permissions
   */
  @Get(':id/my-permissions')
  async getMyPermissions(@Param('id') serverId: string, @Request() req: any) {
    return this.serversService.getCurrentUserPermissions(
      serverId,
      req.user.userId,
    );
  }

  @Get(':id/interaction-settings')
  async getInteractionSettings(
    @Param('id') serverId: string,
    @Request() req: any,
  ) {
    return this.serversService.getInteractionSettings(
      serverId,
      req.user.userId,
    );
  }

  @Patch(':id/interaction-settings')
  async updateInteractionSettings(
    @Param('id') serverId: string,
    @Body()
    body: {
      systemMessagesEnabled?: boolean;
      welcomeMessageEnabled?: boolean;
      stickerReplyWelcomeEnabled?: boolean;
      defaultNotificationLevel?: 'all' | 'mentions';
      systemChannelId?: string | null;
    },
    @Request() req: any,
  ) {
    return this.serversService.updateInteractionSettings(
      serverId,
      req.user.userId,
      body ?? {},
    );
  }

  @Post(':id/role-notifications')
  async createRoleNotification(
    @Param('id') serverId: string,
    @Body()
    body: {
      title: string;
      content: string;
      targetType: 'everyone' | 'role';
      roleId?: string | null;
    },
    @Request() req: any,
  ) {
    return this.serversService.createRoleNotification(
      serverId,
      req.user.userId,
      body,
    );
  }

  // =====================================================
  // MODERATION ENDPOINTS
  // =====================================================

  /**
   * Kick thành viên
   * POST /servers/:id/kick/:memberId
   */
  @Post(':id/kick/:memberId')
  async kickMember(
    @Param('id') serverId: string,
    @Param('memberId') memberId: string,
    @Body() body: { reason?: string },
    @Request() req: any,
  ) {
    return this.serversService.kickMember(
      serverId,
      req.user.userId,
      memberId,
      body?.reason,
    );
  }

  /**
   * Ban thành viên
   * POST /servers/:id/ban/:memberId
   */
  @Post(':id/ban/:memberId')
  async banMember(
    @Param('id') serverId: string,
    @Param('memberId') memberId: string,
    @Body() body: { reason?: string; deleteMessageDays?: number },
    @Request() req: any,
  ) {
    return this.serversService.banMember(
      serverId,
      req.user.userId,
      memberId,
      body?.reason,
      body?.deleteMessageDays,
    );
  }

  /**
   * Unban thành viên
   * POST /servers/:id/unban/:memberId
   */
  @Post(':id/unban/:memberId')
  async unbanMember(
    @Param('id') serverId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
  ) {
    return this.serversService.unbanMember(serverId, req.user.userId, memberId);
  }

  /**
   * Lấy danh sách người bị ban
   * GET /servers/:id/bans
   */
  @Get(':id/bans')
  async getBannedUsers(@Param('id') serverId: string, @Request() req: any) {
    return this.serversService.getBannedUsers(serverId, req.user.userId);
  }

  /**
   * Timeout thành viên
   * POST /servers/:id/timeout/:memberId
   */
  @Post(':id/timeout/:memberId')
  async timeoutMember(
    @Param('id') serverId: string,
    @Param('memberId') memberId: string,
    @Body() body: { durationSeconds: number; reason?: string },
    @Request() req: any,
  ) {
    if (!body?.durationSeconds || body.durationSeconds <= 0) {
      throw new BadRequestException(
        'durationSeconds must be a positive number',
      );
    }
    return this.serversService.timeoutMember(
      serverId,
      req.user.userId,
      memberId,
      body.durationSeconds,
      body?.reason,
    );
  }

  /**
   * Gỡ timeout thành viên
   * POST /servers/:id/remove-timeout/:memberId
   */
  @Post(':id/remove-timeout/:memberId')
  async removeTimeout(
    @Param('id') serverId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
  ) {
    return this.serversService.removeTimeout(
      serverId,
      req.user.userId,
      memberId,
    );
  }

  /**
   * Preview prune count (bulk kick) based on inactivity days + optional role filter.
   * Example: GET /servers/:id/prune/count?days=30&role=none
   */
  @Get(':id/prune/count')
  async getPruneCount(
    @Param('id') serverId: string,
    @Query('days') daysRaw: string,
    @Request() req: any,
    @Query('role') role?: 'moderator' | 'member' | 'none' | 'all',
  ) {
    const days = Number(daysRaw);
    if (!Number.isFinite(days) || days <= 0) {
      throw new BadRequestException('days must be a positive number');
    }
    const count = await this.serversService.getPruneCount({
      serverId,
      requesterUserId: req.user.userId,
      days,
      roleFilter: role,
    });
    return { count };
  }

  /**
   * Execute prune members (bulk kick).
   * Example: POST /servers/:id/prune  { days: 30, role: "none" }
   */
  @Post(':id/prune')
  async pruneMembers(
    @Param('id') serverId: string,
    @Body()
    body: { days: number; role?: 'moderator' | 'member' | 'none' | 'all' },
    @Request() req: any,
  ) {
    const days = Number(body?.days);
    if (!Number.isFinite(days) || days <= 0) {
      throw new BadRequestException('days must be a positive number');
    }
    const removed = await this.serversService.pruneMembers({
      serverId,
      requesterUserId: req.user.userId,
      days,
      roleFilter: body?.role,
    });
    return { removed };
  }

  @Get(':id')
  async getServer(@Param('id') serverId: string) {
    return this.serversService.getServerById(serverId);
  }

  @Get(':id/profile-stats')
  async getServerProfileStats(@Param('id') serverId: string) {
    return this.serversService.getServerProfileStats(serverId);
  }

  @Patch(':id')
  async updateServer(
    @Param('id') serverId: string,
    @Body() updateServerDto: UpdateServerDto,
    @Request() req: any,
  ) {
    return this.serversService.updateServer(
      serverId,
      updateServerDto,
      req.user.userId,
    );
  }

  @Get(':id/safety-settings')
  async getSafetySettings(@Param('id') serverId: string, @Request() req: any) {
    return this.serversService.getServerSafetySettings(
      serverId,
      req.user.userId,
    );
  }

  @Patch(':id/safety-settings')
  async updateSafetySettings(
    @Param('id') serverId: string,
    @Body() body: Record<string, any>,
    @Request() req: any,
  ) {
    return this.serversService.updateServerSafetySettings(
      serverId,
      req.user.userId,
      body,
    );
  }

  @Get(':id/audit-logs')
  async getServerAuditLogs(
    @Param('id') serverId: string,
    @Request() req: any,
    @Query('action') action?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.serversService.getServerAuditLogs(serverId, req.user.userId, {
      action,
      actorUserId,
      limit: limit ? Number(limit) : undefined,
      before,
    });
  }

  @Delete(':id')
  async deleteServer(@Param('id') serverId: string, @Request() req: any) {
    await this.serversService.deleteServer(serverId, req.user.userId);
    return { message: 'Server deleted successfully' };
  }

  @Post(':id/join')
  async joinServer(@Param('id') serverId: string, @Request() req: any) {
    return this.serversService.joinServer(serverId, req.user.userId);
  }

  // =====================================================
  // Access Control (Discord tab "Truy cập")
  // =====================================================

  @Get(':id/access/settings')
  async getAccessSettings(@Param('id') serverId: string) {
    return this.serverAccessService.getAccessSettings(serverId);
  }

  @Patch(':id/access/settings')
  async updateAccessSettings(
    @Param('id') serverId: string,
    @Body()
    body: {
      accessMode?: 'invite_only' | 'apply' | 'discoverable';
      isAgeRestricted?: boolean;
      hasRules?: boolean;
    },
    @Request() req: any,
  ) {
    if (!body) throw new BadRequestException('Missing body');
    return this.serverAccessService.updateAccessSettings(
      serverId,
      req.user.userId,
      body,
    );
  }

  @Post(':id/access/rules')
  async addAccessRule(
    @Param('id') serverId: string,
    @Body() body: { content: string },
    @Request() req: any,
  ) {
    if (!body?.content) throw new BadRequestException('content is required');
    return this.serverAccessService.addRule(
      serverId,
      req.user.userId,
      body.content,
    );
  }

  @Get(':id/access/my-status')
  async getMyAccessStatus(@Param('id') serverId: string, @Request() req: any) {
    return this.serverAccessService.getMyStatus(serverId, req.user.userId);
  }

  @Post(':id/access/approve')
  async approveAccessUser(
    @Param('id') serverId: string,
    @Body() body: { userId: string },
    @Request() req: any,
  ) {
    if (!body?.userId) throw new BadRequestException('userId is required');
    return this.serverAccessService.approveUser(
      serverId,
      req.user.userId,
      body.userId,
    );
  }

  @Post(':id/access/accept-rules')
  async acceptAccessRules(@Param('id') serverId: string, @Request() req: any) {
    return this.serverAccessService.acceptRules(serverId, req.user.userId);
  }

  @Post(':id/access/acknowledge-age')
  async acknowledgeAgeRestricted(
    @Param('id') serverId: string,
    @Request() req: any,
  ) {
    return this.serverAccessService.acknowledgeAgeRestriction(
      serverId,
      req.user.userId,
    );
  }

  @Post(':id/access/request-email-otp')
  async requestServerEmailOtp(
    @Param('id') serverId: string,
    @Request() req: any,
  ) {
    return this.serverAccessService.requestServerEmailOtp(
      serverId,
      req.user.userId,
    );
  }

  @Post(':id/access/verify-email-otp')
  async verifyServerEmailOtp(
    @Param('id') serverId: string,
    @Body() body: { code: string },
    @Request() req: any,
  ) {
    if (!body?.code) throw new BadRequestException('code is required');
    return this.serverAccessService.verifyServerEmailOtp(
      serverId,
      req.user.userId,
      body.code,
    );
  }

  @Post(':id/leave')
  async leaveServer(@Param('id') serverId: string, @Request() req: any) {
    await this.serversService.leaveServer(serverId, req.user.userId);
    return { message: 'Left server successfully' };
  }

  @Post(':id/members/:memberId')
  async addMember(
    @Param('id') serverId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.serversService.addMemberToServer(serverId, memberId);
  }

  @Delete(':id/members/:memberId')
  async removeMember(
    @Param('id') serverId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
  ) {
    return this.serversService.removeMemberFromServer(
      serverId,
      memberId,
      req.user.userId,
    );
  }

  @Patch(':id/transfer-ownership')
  async transferOwnership(
    @Param('id') serverId: string,
    @Body() body: { newOwnerId: string },
    @Request() req: any,
  ) {
    if (!body?.newOwnerId) {
      throw new BadRequestException('newOwnerId is required');
    }
    return this.serversService.transferOwnership(
      serverId,
      req.user.userId,
      body.newOwnerId,
    );
  }

  @Post(':id/categories')
  async createCategory(
    @Param('id') serverId: string,
    @Body() body: { name: string; isPrivate?: boolean },
    @Request() req: any,
  ) {
    return this.serversService.createCategory(
      serverId,
      req.user.userId,
      body.name,
      body.isPrivate ?? false,
    );
  }

  @Get(':id/categories')
  async getCategories(@Param('id') serverId: string) {
    return this.serversService.getCategories(serverId);
  }

  @Get(':id/mention-restricted')
  async getMentionRestrictedMembers(
    @Param('id') serverId: string,
    @Request() req: any,
  ) {
    return this.serversService.getMentionRestrictedMembers(
      serverId,
      req.user.userId,
    );
  }

  @Post(':id/unrestrict/:memberId')
  async unrestrictMember(
    @Param('id') serverId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
  ) {
    await this.serversService.unrestrictMember(
      serverId,
      req.user.userId,
      memberId,
    );
    return { success: true };
  }
}
