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
import { CreateReportPostDto } from './dto/create-reportpost.dto';
import { ReportPostService } from './reportpost.service';

@Controller('report-posts')
@UseGuards(JwtAuthGuard)
export class ReportPostController {
  constructor(private readonly reportPostService: ReportPostService) {}

  @Post(':postId')
  async create(
    @Param('postId') postId: string,
    @Body() dto: CreateReportPostDto,
    @Req() req: Request,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }

    return this.reportPostService.create(user.userId, postId, dto);
  }
}
