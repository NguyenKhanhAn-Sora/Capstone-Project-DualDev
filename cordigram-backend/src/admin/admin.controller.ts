import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  async getStats(@Req() req: Request & { user?: AuthenticatedUser }) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    return this.adminService.getStats();
  }

  @Get('activity/recent')
  async getRecentActivity(
    @Query('limit') limitRaw: string | undefined,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    const parsedLimit = Number(limitRaw);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;
    return this.adminService.getRecentAdminActivity(limit);
  }

  @Get('ads/overview')
  async getAdsOverview(@Req() req: Request & { user?: AuthenticatedUser }) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    return this.adminService.getAdsOverview();
  }

  @Get('ads/campaigns')
  async getAdsCampaigns(
    @Query('q') q: string | undefined,
    @Query('status') status: string | undefined,
    @Query('limit') limitRaw: string | undefined,
    @Query('offset') offsetRaw: string | undefined,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }

    const parsedLimit = Number(limitRaw);
    const parsedOffset = Number(offsetRaw);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;
    const offset = Number.isFinite(parsedOffset) ? parsedOffset : undefined;

    const normalizedStatus =
      status === 'active' ||
      status === 'hidden' ||
      status === 'canceled' ||
      status === 'completed'
        ? status
        : status === 'paused'
          ? 'hidden'
          : 'all';

    return this.adminService.getAdsCampaigns({
      q,
      status: normalizedStatus,
      limit,
      offset,
    });
  }

  @Get('ads/campaigns/:campaignId')
  async getAdsCampaignDetail(
    @Param('campaignId') campaignId: string,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }

    return this.adminService.getAdsCampaignDetail(campaignId);
  }

  @Post('ads/campaigns/:campaignId/action')
  async performAdsCampaignAdminAction(
    @Param('campaignId') campaignId: string,
    @Body()
    body: {
      action?: 'cancel_campaign' | 'reopen_canceled_campaign';
      reason?: string;
    },
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }

    if (!body?.action) {
      throw new BadRequestException('Missing action');
    }

    if (
      !['cancel_campaign', 'reopen_canceled_campaign'].includes(body.action)
    ) {
      throw new BadRequestException('Invalid action');
    }

    if (body.action === 'cancel_campaign' && !body.reason?.trim()) {
      throw new BadRequestException('Missing cancellation reason');
    }

    return this.adminService.performAdsCampaignAdminAction({
      campaignId,
      action: body.action,
      reason: body.reason,
      adminId: req.user?.userId ?? '',
    });
  }

  @Get('activity/logs')
  async getAuditLogs(
    @Query('limit') limitRaw: string | undefined,
    @Query('offset') offsetRaw: string | undefined,
    @Query('type') type: string | undefined,
    @Query('action') action: string | undefined,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    const parsedLimit = Number(limitRaw);
    const parsedOffset = Number(offsetRaw);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;
    const offset = Number.isFinite(parsedOffset) ? parsedOffset : undefined;
    return this.adminService.getAuditLogs({
      limit,
      offset,
      type,
      action,
    });
  }

  @Get('broadcast-notice/history')
  async getBroadcastNoticeHistory(
    @Query('limit') limitRaw: string | undefined,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    const parsedLimit = Number(limitRaw);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;
    return this.adminService.getBroadcastNoticeHistory(limit);
  }

  @Get('broadcast-notice/users/suggest')
  async suggestBroadcastUsers(
    @Query('q') query: string | undefined,
    @Query('limit') limitRaw: string | undefined,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    const parsedLimit = Number(limitRaw);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;
    return this.adminService.suggestBroadcastUsers(query, limit);
  }

  @Post('broadcast-notice/send')
  async sendBroadcastNotice(
    @Body()
    body: {
      title?: string;
      body?: string;
      level?: 'info' | 'warning' | 'critical';
      actionUrl?: string | null;
      targetMode?: 'all' | 'include' | 'exclude';
      includeUserIds?: string[];
      excludeUserIds?: string[];
    },
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }

    const adminId = req.user?.userId ?? '';
    return this.adminService.sendBroadcastNotice({
      adminId,
      title: body.title ?? '',
      body: body.body ?? '',
      level: body.level,
      actionUrl: body.actionUrl ?? null,
      targetMode: body.targetMode,
      includeUserIds: Array.isArray(body.includeUserIds)
        ? body.includeUserIds
        : [],
      excludeUserIds: Array.isArray(body.excludeUserIds)
        ? body.excludeUserIds
        : [],
    });
  }

  @Get('reports/:type/:targetId')
  async getReportDetail(
    @Param('type') type: string,
    @Param('targetId') targetId: string,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    return this.adminService.getReportDetail(type, targetId);
  }

  @Get('reports-resolved')
  async getResolvedReports(
    @Query('type') type: string | undefined,
    @Query('limit') limitRaw: string | undefined,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    const parsedLimit = Number(limitRaw);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;
    return this.adminService.getResolvedReports({ type, limit });
  }

  @Get('moderation/media')
  async getMediaModerationQueue(
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    return this.adminService.getMediaModerationQueue();
  }

  @Get('moderation/content/posts')
  async getDirectModerationPosts(
    @Query('q') q: string | undefined,
    @Query('limit') limitRaw: string | undefined,
    @Query('offset') offsetRaw: string | undefined,
    @Query('state') state: string | undefined,
    @Query('type') type: string | undefined,
    @Query('visibility') visibility: string | undefined,
    @Query('autoHidden') autoHidden: string | undefined,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    const parsedLimit = Number(limitRaw);
    const parsedOffset = Number(offsetRaw);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;
    const offset = Number.isFinite(parsedOffset) ? parsedOffset : undefined;
    return this.adminService.getDirectModerationPosts({
      q,
      limit,
      offset,
      state,
      type,
      visibility,
      autoHidden,
    });
  }

  @Get('moderation/content/comments')
  async getDirectModerationComments(
    @Query('q') q: string | undefined,
    @Query('limit') limitRaw: string | undefined,
    @Query('offset') offsetRaw: string | undefined,
    @Query('state') state: string | undefined,
    @Query('autoHidden') autoHidden: string | undefined,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    const parsedLimit = Number(limitRaw);
    const parsedOffset = Number(offsetRaw);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;
    const offset = Number.isFinite(parsedOffset) ? parsedOffset : undefined;
    return this.adminService.getDirectModerationComments({
      q,
      limit,
      offset,
      state,
      autoHidden,
    });
  }

  @Get('moderation/content/users')
  async getDirectModerationUsers(
    @Query('q') q: string | undefined,
    @Query('limit') limitRaw: string | undefined,
    @Query('offset') offsetRaw: string | undefined,
    @Query('status') status: string | undefined,
    @Query('risk') risk: string | undefined,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    const parsedLimit = Number(limitRaw);
    const parsedOffset = Number(offsetRaw);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;
    const offset = Number.isFinite(parsedOffset) ? parsedOffset : undefined;
    return this.adminService.getDirectModerationUsers({
      q,
      limit,
      offset,
      status,
      risk,
    });
  }

  @Get('moderation/content/:type/:targetId')
  async getDirectModerationTargetDetail(
    @Param('type') type: string,
    @Param('targetId') targetId: string,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    return this.adminService.getDirectModerationTargetDetail(type, targetId);
  }

  @Post('moderation/content/action')
  async moderateContentDirect(
    @Body()
    body: {
      type?: 'post' | 'comment' | 'user';
      targetId?: string;
      action?:
        | 'no_violation'
        | 'remove_post'
        | 'restrict_post'
        | 'delete_comment'
        | 'warn'
        | 'mute_interaction'
        | 'suspend_user'
        | 'limit_account'
        | 'violation';
      category?: string;
      reason?: string;
      severity?: 'low' | 'medium' | 'high';
      muteDurationMinutes?: number;
      muteUntilTurnOn?: boolean;
      suspendDurationMinutes?: number;
      suspendUntilTurnOn?: boolean;
      limitDurationMinutes?: number;
      limitUntilTurnOn?: boolean;
      note?: string | null;
    },
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    const adminId = req.user?.userId ?? '';
    return this.adminService.moderateContentDirect({
      type: body.type ?? 'post',
      targetId: body.targetId ?? '',
      action: body.action,
      category: body.category ?? '',
      reason: body.reason ?? '',
      severity: body.severity,
      muteDurationMinutes: body.muteDurationMinutes,
      muteUntilTurnOn: body.muteUntilTurnOn,
      suspendDurationMinutes: body.suspendDurationMinutes,
      suspendUntilTurnOn: body.suspendUntilTurnOn,
      limitDurationMinutes: body.limitDurationMinutes,
      limitUntilTurnOn: body.limitUntilTurnOn,
      note: body.note ?? null,
      adminId,
    });
  }

  @Get('moderation/media/:postId')
  async getMediaModerationDetail(
    @Param('postId') postId: string,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    return this.adminService.getMediaModerationDetail(postId);
  }

  @Post('moderation/media/:postId/items/:mediaIndex/action')
  async applyMediaModerationAction(
    @Param('postId') postId: string,
    @Param('mediaIndex') mediaIndexRaw: string,
    @Body()
    body: {
      decision?: 'blur' | 'reject';
    },
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }

    const mediaIndex = Number(mediaIndexRaw);
    if (!Number.isInteger(mediaIndex) || mediaIndex < 0) {
      throw new BadRequestException('Invalid media index');
    }

    const decision = body.decision;
    if (decision !== 'blur' && decision !== 'reject') {
      throw new BadRequestException('Invalid decision');
    }

    const adminId = req.user?.userId ?? '';
    return this.adminService.applyMediaModerationAction({
      postId,
      mediaIndex,
      decision,
      adminId,
    });
  }

  @Post('reports/:type/:targetId/violation')
  async markReportViolation(
    @Param('type') type: string,
    @Param('targetId') targetId: string,
    @Body()
    body: {
      category?: string;
      reason?: string;
      severity?: 'low' | 'medium' | 'high';
      note?: string | null;
    },
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    const adminId = req.user?.userId ?? '';
    return this.adminService.resolveReportAction({
      type,
      targetId,
      action: 'violation',
      category: body.category ?? '',
      reason: body.reason ?? '',
      severity: body.severity,
      note: body.note ?? null,
      adminId,
    });
  }

  @Post('reports/:type/:targetId/resolve')
  async resolveReport(
    @Param('type') type: string,
    @Param('targetId') targetId: string,
    @Body()
    body: {
      action?:
        | 'no_violation'
        | 'remove_post'
        | 'restrict_post'
        | 'delete_comment'
        | 'warn'
        | 'mute_interaction'
        | 'suspend_user'
        | 'limit_account'
        | 'violation';
      category?: string;
      reason?: string;
      severity?: 'low' | 'medium' | 'high';
      muteDurationMinutes?: number;
      muteUntilTurnOn?: boolean;
      suspendDurationMinutes?: number;
      suspendUntilTurnOn?: boolean;
      limitDurationMinutes?: number;
      limitUntilTurnOn?: boolean;
      note?: string | null;
    },
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    const adminId = req.user?.userId ?? '';
    return this.adminService.resolveReportAction({
      type,
      targetId,
      action: body.action,
      category: body.category ?? '',
      reason: body.reason ?? '',
      severity: body.severity,
      muteDurationMinutes: body.muteDurationMinutes,
      muteUntilTurnOn: body.muteUntilTurnOn,
      suspendDurationMinutes: body.suspendDurationMinutes,
      suspendUntilTurnOn: body.suspendUntilTurnOn,
      limitDurationMinutes: body.limitDurationMinutes,
      limitUntilTurnOn: body.limitUntilTurnOn,
      note: body.note ?? null,
      adminId,
    });
  }

  @Post('reports/:type/:targetId/rollback-auto-hide')
  async rollbackAutoHide(
    @Param('type') type: string,
    @Param('targetId') targetId: string,
    @Body()
    body: {
      note?: string | null;
    },
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    const adminId = req.user?.userId ?? '';
    return this.adminService.rollbackAutoHiddenAndDismiss({
      type,
      targetId,
      note: body.note ?? null,
      adminId,
    });
  }

  @Post('reports-resolved/:actionId/rollback')
  async rollbackResolvedDecision(
    @Param('actionId') actionId: string,
    @Body()
    body: {
      note?: string | null;
    },
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    const adminId = req.user?.userId ?? '';
    return this.adminService.rollbackResolvedDecision({
      actionId,
      note: body.note ?? null,
      adminId,
    });
  }

  @Post('reports/:type/:targetId/reopen')
  async reopenResolvedCase(
    @Param('type') type: string,
    @Param('targetId') targetId: string,
    @Body()
    body: {
      note?: string | null;
    },
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    const adminId = req.user?.userId ?? '';
    return this.adminService.reopenResolvedCase({
      type,
      targetId,
      note: body.note ?? null,
      adminId,
    });
  }

  @Get('community-discovery')
  async getCommunityDiscoveryServers(
    @Query('status') statusRaw: string | undefined,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    const status =
      statusRaw === 'pending' ||
      statusRaw === 'approved' ||
      statusRaw === 'rejected' ||
      statusRaw === 'removed'
        ? statusRaw
        : 'all';
    return this.adminService.getCommunityDiscoveryServers({ status });
  }

  @Post('community-discovery/:serverId/approve')
  async approveCommunityDiscoveryServer(
    @Param('serverId') serverId: string,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    return this.adminService.setCommunityDiscoveryApproval({
      serverId,
      status: 'approved',
      adminId: req.user?.userId,
    });
  }

  @Post('community-discovery/:serverId/reject')
  async rejectCommunityDiscoveryServer(
    @Param('serverId') serverId: string,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    return this.adminService.setCommunityDiscoveryApproval({
      serverId,
      status: 'rejected',
      adminId: req.user?.userId,
    });
  }

  @Post('community-discovery/:serverId/remove')
  async removeCommunityDiscoveryServer(
    @Param('serverId') serverId: string,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    const adminId = req.user?.userId ?? '';
    return this.adminService.removeFromDiscovery({ serverId, adminId });
  }

  @Post('community-discovery/:serverId/restore')
  async restoreCommunityDiscoveryServer(
    @Param('serverId') serverId: string,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    const adminId = req.user?.userId ?? '';
    return this.adminService.restoreDiscovery({ serverId, adminId });
  }

  @Get('community-discovery/history')
  async getCommunityDiscoveryHistory(
    @Query('serverId') serverId: string | undefined,
    @Query('limit') limitRaw: string | undefined,
    @Query('offset') offsetRaw: string | undefined,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    const limit = Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : 50;
    const offset = Number.isFinite(Number(offsetRaw)) ? Number(offsetRaw) : 0;
    return this.adminService.getCommunityDiscoveryHistory({
      serverId,
      limit,
      offset,
    });
  }

  @Get('community-discovery/:serverId/view')
  async adminGetServerView(
    @Param('serverId') serverId: string,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    const adminUserId = req.user?.userId;
    return this.adminService.adminGetServerView(serverId, adminUserId);
  }

  @Post('community-discovery/:serverId/leave')
  async adminLeaveServer(
    @Param('serverId') serverId: string,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    const adminUserId = req.user?.userId;
    return this.adminService.adminLeaveServer(serverId, adminUserId);
  }

  @Get('community-discovery/:serverId/channels/:channelId/messages')
  async adminGetChannelMessages(
    @Param('serverId') serverId: string,
    @Param('channelId') channelId: string,
    @Query('limit') limit: number = 50,
    @Query('skip') skip: number = 0,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const roles = req.user?.roles ?? [];
    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }
    return this.adminService.adminGetChannelMessages(
      serverId,
      channelId,
      +limit || 50,
      +skip || 0,
    );
  }
}
