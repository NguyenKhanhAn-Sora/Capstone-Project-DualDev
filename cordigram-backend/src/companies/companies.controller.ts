import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import type { Request } from 'express';
import { CompaniesService } from './companies.service';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @UseGuards(JwtAuthGuard)
  @Get('suggest')
  async suggest(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    if (!q || !q.trim()) {
      throw new BadRequestException('q is required');
    }

    const items = await this.companiesService.suggest({
      q,
      limit: limit ? Number(limit) : 8,
    });

    return { items, count: items.length };
  }
}
