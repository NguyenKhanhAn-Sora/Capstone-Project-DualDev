import {
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
}
