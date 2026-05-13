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
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { ServersService } from './servers.service';
import { ServerAccessService } from '../access/server-access.service';
import { CreateServerDto } from './dto/create-server.dto';
import { UpdateServerDto } from './dto/update-server.dto';
import { AddServerStickerDto } from './dto/add-server-sticker.dto';
import { AddServerEmojiDto } from './dto/add-server-emoji.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { v4 as uuid } from 'uuid';
import { ConfigService } from '../config/config.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { ForbiddenException } from '@nestjs/common';
import { ServerBoostContextInterceptor } from './server-boost-context.interceptor';
import { BoostService } from '../boost/boost.service';
import { isCordigramMessagesUpload } from '../common/cordigram-upload-context';
import type { Request as ExpressRequest } from 'express';

type MulterFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const SERVER_AVATAR_MULTER_CEILING = 600 * 1024 * 1024;

const imageFileFilter = (
  req: any,
  file: MulterFile,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new BadRequestException('Please choose an image file'), false);
  }
  cb(null, true);
};

@Controller('servers')
@UseGuards(JwtAuthGuard)
export class ServersController {
  constructor(
    private readonly serversService: ServersService,
    private readonly serverAccessService: ServerAccessService,
    private readonly config: ConfigService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly boostService: BoostService,
  ) {}

  /**
   * Explore servers list (approved only)
   */
  @Get('explore')
  async listExploreServers() {
    return this.serversService.listExploreServers();
  }

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
   * Sticker máy chủ cho picker (theo mọi server user tham gia).
   * Query contextServerId = server đang mở chat để đánh dấu khóa/mở.
   */
  @Get('sticker-picker')
  async getStickerPicker(
    @Query('contextServerId') contextServerId: string | undefined,
    @Request() req: any,
  ) {
    return this.serversService.getStickerPickerData(
      req.user.userId,
      contextServerId,
    );
  }

  @Get('emoji-picker')
  async getEmojiPicker(
    @Query('contextServerId') contextServerId: string | undefined,
    @Request() req: any,
  ) {
    return this.serversService.getEmojiPickerData(
      req.user.userId,
      contextServerId,
    );
  }

  @Get('emoji-upload-targets')
  async getEmojiUploadTargets(@Request() req: any) {
    return this.serversService.getEmojiUploadTargets(req.user.userId);
  }

  @Get('sticker-upload-targets')
  async getStickerUploadTargets(@Request() req: any) {
    return this.serversService.getStickerUploadTargets(req.user.userId);
  }

  /**
   * Preview máy chủ cho embed invite (DM): luôn 200 + `{ server: null }` nếu không còn server.
   */
  @Get('embed-preview')
  async getServerEmbedPreview(@Query('id') serverId: string | undefined) {
    const id = String(serverId || '').trim();
    if (!id) return { server: null };
    return this.serversService.getServerEmbedPreview(id);
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

  @Post(':id/stickers')
  async addServerSticker(
    @Param('id') serverId: string,
    @Body() body: AddServerStickerDto,
    @Request() req: any,
  ) {
    return this.serversService.addServerSticker(
      serverId,
      req.user.userId,
      body,
    );
  }

  /** Danh sách sticker tùy chỉnh (cài đặt máy chủ) — chỉ người có quyền quản lý. */
  @Get(':id/stickers/manage')
  async getServerStickersManage(
    @Param('id') serverId: string,
    @Request() req: any,
  ) {
    return this.serversService.getServerStickersManage(
      serverId,
      req.user.userId,
    );
  }

  /**
   * Chủ máy chủ gán mức mở rộng ô sticker (tối đa 2 máy chủ / chủ).
   * PATCH /servers/sticker-boost/:id — literal trước :id để tránh xung đột với @Patch(':id').
   */
  @Patch('sticker-boost/:id')
  async setServerStickerBoostTier(
    @Param('id') serverId: string,
    @Body() body: { tier?: 'basic' | 'boost' | null },
    @Request() req: any,
  ) {
    const tier =
      body?.tier === 'basic' || body?.tier === 'boost' ? body.tier : null;
    return this.serversService.setServerStickerBoostTier(
      serverId,
      req.user.userId,
      tier,
    );
  }

  @Post(':id/emojis')
  async addServerEmoji(
    @Param('id') serverId: string,
    @Body() body: AddServerEmojiDto,
    @Request() req: any,
  ) {
    return this.serversService.addServerEmoji(serverId, req.user.userId, body);
  }

  /** Danh sách emoji tùy chỉnh (màn cài đặt máy chủ) — chỉ người có quyền quản lý. */
  @Get(':id/emojis/manage')
  async getServerEmojisManage(
    @Param('id') serverId: string,
    @Request() req: any,
  ) {
    return this.serversService.getServerEmojisManage(serverId, req.user.userId);
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
  async joinServer(
    @Param('id') serverId: string,
    @Body()
    body: {
      rulesAccepted?: boolean;
      nickname?: string;
      applicationAnswers?: Array<{
        questionId: string;
        text?: string;
        selectedOption?: string;
      }>;
    },
    @Request() req: any,
  ) {
    return this.serversService.joinServer(
      serverId,
      req.user.userId,
      body ?? {},
    );
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

  @Patch(':id/access/rules/:ruleId')
  async patchAccessRule(
    @Param('id') serverId: string,
    @Param('ruleId') ruleId: string,
    @Body() body: { content: string },
    @Request() req: any,
  ) {
    if (!body?.content) throw new BadRequestException('content is required');
    return this.serverAccessService.updateRule(
      serverId,
      req.user.userId,
      ruleId,
      body.content,
    );
  }

  @Delete(':id/access/rules/:ruleId')
  async deleteAccessRule(
    @Param('id') serverId: string,
    @Param('ruleId') ruleId: string,
    @Request() req: any,
  ) {
    return this.serverAccessService.deleteRule(
      serverId,
      req.user.userId,
      ruleId,
    );
  }

  @Get(':id/access/join-form')
  async getJoinApplicationForm(
    @Param('id') serverId: string,
    @Request() req: any,
  ) {
    return this.serverAccessService.getJoinApplicationForm(
      serverId,
      req.user.userId,
    );
  }

  @Patch(':id/access/join-form')
  async updateJoinApplicationForm(
    @Param('id') serverId: string,
    @Body()
    body: {
      enabled?: boolean;
      questions?: Array<{
        id: string;
        title: string;
        type: 'short' | 'paragraph' | 'multiple_choice';
        required?: boolean;
        options?: string[];
      }>;
    },
    @Request() req: any,
  ) {
    if (!body) throw new BadRequestException('Missing body');
    return this.serverAccessService.updateJoinApplicationForm(
      serverId,
      req.user.userId,
      body,
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

  @Post(':id/access/reject')
  async rejectAccessUser(
    @Param('id') serverId: string,
    @Body() body: { userId: string },
    @Request() req: any,
  ) {
    if (!body?.userId) throw new BadRequestException('userId is required');
    return this.serverAccessService.rejectUser(
      serverId,
      req.user.userId,
      body.userId,
    );
  }

  @Get(':id/access/join-applications')
  async listJoinApplications(
    @Param('id') serverId: string,
    @Query('status') status: string = 'pending',
    @Request() req: any,
  ) {
    return this.serverAccessService.listJoinApplications(
      serverId,
      req.user.userId,
      status,
    );
  }

  @Get(':id/access/join-applications/:applicantUserId')
  async getJoinApplicationDetail(
    @Param('id') serverId: string,
    @Param('applicantUserId') applicantUserId: string,
    @Request() req: any,
  ) {
    return this.serverAccessService.getJoinApplicationDetail(
      serverId,
      req.user.userId,
      applicantUserId,
    );
  }

  @Post(':id/access/withdraw')
  async withdrawMyJoinApplication(
    @Param('id') serverId: string,
    @Request() req: any,
  ) {
    return this.serverAccessService.withdrawJoinApplication(
      serverId,
      req.user.userId,
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

  @Patch(':id/me/nickname')
  async updateMyServerNickname(
    @Param('id') serverId: string,
    @Body() body: { nickname?: string },
    @Request() req: any,
  ) {
    await this.serversService.updateMyServerNickname(
      serverId,
      req.user.userId,
      body?.nickname ?? '',
    );
    return { ok: true };
  }

  /**
   * Hồ sơ trong máy chủ (per-server): avatar + banner/cover (và nickname lấy từ member row).
   */
  @Get(':id/me/profile')
  async getMyServerProfile(@Param('id') serverId: string, @Request() req: any) {
    return this.serversService.getMyServerProfile(serverId, req.user.userId);
  }

  @Patch(':id/me/profile')
  async updateMyServerProfile(
    @Param('id') serverId: string,
    @Body()
    body: {
      coverUrl?: string | null;
      profileThemePrimaryHex?: string | null;
      profileThemeAccentHex?: string | null;
      displayNameFontId?: string | null;
      displayNameEffectId?: string | null;
      displayNamePrimaryHex?: string | null;
      displayNameAccentHex?: string | null;
    },
    @Request() req: any,
  ) {
    const next =
      (body?.coverUrl ?? null) === null
        ? null
        : String(body?.coverUrl ?? '').trim();
    const isImageUrl = Boolean(next && /^https?:\/\//i.test(next));
    if (isImageUrl) {
      const accountBoost = Boolean(req?.user?.settings?.accountBoost);
      const server = await this.serversService.getServerById(serverId);
      const boostedBy = Array.isArray((server as any)?.boostedByUserIds)
        ? (server as any).boostedByUserIds
        : [];
      const serverBoost = boostedBy.some(
        (x: any) => String(x) === String(req.user.userId),
      );
      const unlocked = accountBoost || serverBoost;
      if (!unlocked) {
        throw new ForbiddenException('Boost required for banner image');
      }
    }
    await this.serversService.updateMyServerProfile(serverId, req.user.userId, {
      coverUrl: body?.coverUrl ?? null,
      profileThemePrimaryHex: body?.profileThemePrimaryHex ?? null,
      profileThemeAccentHex: body?.profileThemeAccentHex ?? null,
      displayNameFontId: body?.displayNameFontId ?? null,
      displayNameEffectId: body?.displayNameEffectId ?? null,
      displayNamePrimaryHex: body?.displayNamePrimaryHex ?? null,
      displayNameAccentHex: body?.displayNameAccentHex ?? null,
    });
    return { ok: true };
  }

  @Post(':id/me/avatar/upload')
  @UseInterceptors(
    ServerBoostContextInterceptor,
    FileFieldsInterceptor(
      [
        { name: 'original', maxCount: 1 },
        { name: 'cropped', maxCount: 1 },
      ],
      {
        limits: { fileSize: SERVER_AVATAR_MULTER_CEILING },
        fileFilter: imageFileFilter,
      },
    ),
  )
  async uploadMyServerAvatar(
    @Param('id') serverId: string,
    @UploadedFiles()
    files: { original?: MulterFile[]; cropped?: MulterFile[] },
    @Request() req: any,
  ) {
    const userId = req.user.userId as string;
    const originalFile = files?.original?.[0];
    const croppedFile = files?.cropped?.[0];
    if (!originalFile) {
      throw new BadRequestException('Thiếu file original');
    }

    const boost = await this.boostService.getBoostStatus(userId);
    const maxAvatarBytes = isCordigramMessagesUpload(req as ExpressRequest)
      ? boost.active
        ? boost.limits.maxUploadBytes
        : MAX_AVATAR_BYTES
      : MAX_AVATAR_BYTES;
    for (const f of [originalFile, croppedFile].filter(
      Boolean,
    ) as MulterFile[]) {
      if (typeof f.size === 'number' && f.size > maxAvatarBytes) {
        throw new BadRequestException(
          `File too large (max ${maxAvatarBytes} bytes)`,
        );
      }
    }

    const folder = [
      this.config.cloudinaryFolder,
      'servers',
      serverId,
      'members',
      userId,
      'avatars',
    ]
      .filter(Boolean)
      .join('/');
    const suffix = uuid();
    const isGif =
      originalFile.mimetype === 'image/gif' ||
      originalFile.originalname?.toLowerCase?.().endsWith?.('.gif');

    if (isGif) {
      const accountBoost = Boolean(req?.user?.settings?.accountBoost);
      const boostedBy = req?.serverBoostedByUserIds as string[] | undefined;
      const serverBoost =
        Array.isArray(boostedBy) && userId
          ? boostedBy.some((x) => String(x) === userId)
          : false;
      const unlocked = accountBoost || serverBoost || Boolean(boost?.active);
      if (!unlocked) {
        throw new BadRequestException('Boost required for GIF avatar');
      }
    }

    // GIF: accept original only to preserve animation.
    if (!croppedFile) {
      if (!isGif) {
        throw new BadRequestException('Thiếu file cropped');
      }
      const uploaded = await this.cloudinaryService.uploadBuffer({
        buffer: originalFile.buffer,
        folder,
        publicId: `avatar-${suffix}`,
      });
      return this.serversService.setMyServerAvatar(serverId, userId, {
        avatarUrl: uploaded.secureUrl,
      });
    }

    const [, cropped] = await Promise.all([
      this.cloudinaryService.uploadBuffer({
        buffer: originalFile.buffer,
        folder,
        publicId: `original-${suffix}`,
      }),
      this.cloudinaryService.uploadBuffer({
        buffer: croppedFile.buffer,
        folder,
        publicId: `avatar-${suffix}`,
      }),
    ]);

    return this.serversService.setMyServerAvatar(serverId, userId, {
      avatarUrl: cropped.secureUrl,
    });
  }

  @Delete(':id/me/avatar')
  async resetMyServerAvatar(
    @Param('id') serverId: string,
    @Request() req: any,
  ) {
    return this.serversService.resetMyServerAvatar(serverId, req.user.userId);
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

  // =====================================================
  // Discovery Eligibility
  // =====================================================

  @Get(':id/discovery-eligibility')
  async getDiscoveryEligibility(
    @Param('id') serverId: string,
    @Request() req: any,
  ) {
    return this.serversService.getDiscoveryEligibility(
      serverId,
      req.user.userId,
    );
  }

  // =====================================================
  // Community Settings
  // =====================================================

  @Get(':id/community')
  async getCommunitySettings(
    @Param('id') serverId: string,
    @Request() req: any,
  ) {
    return this.serversService.getCommunitySettings(serverId, req.user.userId);
  }

  @Post(':id/community/activate')
  async activateCommunity(
    @Param('id') serverId: string,
    @Body()
    body: {
      rulesChannelId?: string | null;
      updatesChannelId?: string | null;
      createRulesChannel?: boolean;
      createUpdatesChannel?: boolean;
    },
    @Request() req: any,
  ) {
    return this.serversService.activateCommunity(
      serverId,
      req.user.userId,
      body,
    );
  }

  @Post(':id/community/overview')
  async updateCommunityOverview(
    @Param('id') serverId: string,
    @Body()
    body: {
      rulesChannelId?: string | null;
      primaryLanguage?: 'vi' | 'en';
      description?: string | null;
    },
    @Request() req: any,
  ) {
    return this.serversService.updateCommunityOverview(
      serverId,
      req.user.userId,
      body,
    );
  }
}
