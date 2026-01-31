import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreateReportProblemDto } from './dto/create-reportproblem.dto';
import { ReportProblemService } from './reportproblem.service';

type UploadedFile = {
  buffer: Buffer;
  mimetype: string;
  size?: number;
  originalname?: string;
};

@Controller('reportproblem')
@UseGuards(JwtAuthGuard)
export class ReportProblemController {
  constructor(private readonly reportService: ReportProblemService) {}

  @Post()
  @UseInterceptors(
    FilesInterceptor('files', 5, {
      limits: {
        fileSize: 100 * 1024 * 1024,
      },
    }),
  )
  async create(
    @Req() req: Request,
    @Body() dto: CreateReportProblemDto,
    @UploadedFiles() files: UploadedFile[] | undefined,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }

    const safeFiles = files ?? [];
    if (safeFiles.some((file) => !file?.buffer)) {
      throw new BadRequestException('Invalid file payload');
    }

    return this.reportService.create(user.userId, dto, safeFiles);
  }
}
