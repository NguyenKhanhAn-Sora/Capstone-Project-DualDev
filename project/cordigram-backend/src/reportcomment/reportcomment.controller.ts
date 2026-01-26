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
import { CreateReportCommentDto } from './dto/create-reportcomment.dto';
import { ReportCommentService } from './reportcomment.service';

@Controller('report-comments')
@UseGuards(JwtAuthGuard)
export class ReportCommentController {
  constructor(private readonly reportCommentService: ReportCommentService) {}

  @Post(':commentId')
  async create(
    @Param('commentId') commentId: string,
    @Body() dto: CreateReportCommentDto,
    @Req() req: Request,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }

    return this.reportCommentService.create(user.userId, commentId, dto);
  }
}
