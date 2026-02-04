import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreateReportUserDto } from './dto/create-reportuser.dto';
import { ReportUserService } from './reportuser.service';

@Controller('report-users')
@UseGuards(JwtAuthGuard)
export class ReportUserController {
  constructor(private readonly reportUserService: ReportUserService) {}

  @Post(':id')
  async create(
    @Req() req: Request,
    @Param('id') targetUserId: string,
    @Body() dto: CreateReportUserDto,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.reportUserService.create(user.userId, targetUserId, dto);
  }
}
