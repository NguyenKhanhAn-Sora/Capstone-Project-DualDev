import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreatorVerificationService } from './creator-verification.service';

@Controller('creator-verification')
@UseGuards(JwtAuthGuard)
export class CreatorVerificationController {
  constructor(
    private readonly creatorVerificationService: CreatorVerificationService,
  ) {}

  @Get('me')
  async getMyStatus(@Req() req: Request & { user?: AuthenticatedUser }) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.creatorVerificationService.getMyStatus(userId);
  }

  @Post('request')
  async submitRequest(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Body() body: { note?: string },
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.creatorVerificationService.submitRequest(userId, body.note);
  }

  @Get('admin/requests')
  async listRequests(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Query('status') status?: 'pending' | 'approved' | 'rejected',
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursor?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('sort') sort?: 'asc' | 'desc',
  ) {
    await this.creatorVerificationService.assertAdmin(req.user?.roles);
    const parsedLimit = Number(limitRaw);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;
    return this.creatorVerificationService.listRequestsForAdmin({
      status,
      limit,
      cursor: cursor ?? null,
      startDate,
      endDate,
      sort,
    });
  }

  @Get('admin/requests/:requestId')
  async getRequestDetail(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Param('requestId') requestId: string,
  ) {
    await this.creatorVerificationService.assertAdmin(req.user?.roles);
    return this.creatorVerificationService.getRequestDetailForAdmin(requestId);
  }

  @Patch('admin/requests/review')
  async reviewRequest(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Body()
    body: {
      requestId?: string;
      decision?: 'approved' | 'rejected';
      reason?: string;
    },
  ) {
    const adminId = req.user?.userId;
    if (!adminId) {
      throw new UnauthorizedException('Unauthorized');
    }
    await this.creatorVerificationService.assertAdmin(req.user?.roles);
    if (!body.requestId || !body.decision) {
      throw new BadRequestException('requestId and decision are required');
    }
    return this.creatorVerificationService.reviewRequest({
      adminId,
      requestId: body.requestId,
      decision: body.decision,
      decisionReason: body.reason,
    });
  }

  @Patch('admin/requests/revoke-creator')
  async revokeCreatorAccess(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Body()
    body: {
      requestId?: string;
      note?: string;
    },
  ) {
    const adminId = req.user?.userId;
    if (!adminId) {
      throw new UnauthorizedException('Unauthorized');
    }
    await this.creatorVerificationService.assertAdmin(req.user?.roles);
    if (!body.requestId) {
      throw new BadRequestException('requestId is required');
    }
    return this.creatorVerificationService.revokeCreatorAccess({
      adminId,
      requestId: body.requestId,
      note: body.note,
    });
  }
}
