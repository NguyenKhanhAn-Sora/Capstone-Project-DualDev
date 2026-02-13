import {
  Controller,
  Get,
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
}
