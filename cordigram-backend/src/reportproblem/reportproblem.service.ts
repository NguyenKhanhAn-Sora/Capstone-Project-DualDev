import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { ConfigService } from '../config/config.service';
import {
  ReportProblem,
  ReportProblemAttachment,
  ReportProblemStatus,
} from './reportproblem.schema';
import { CreateReportProblemDto } from './dto/create-reportproblem.dto';

type UploadedFile = {
  buffer: Buffer;
  mimetype: string;
  size?: number;
  originalname?: string;
};

export type ReportProblemResponse = {
  id: string;
  reporterId: string;
  userId: string;
  description: string;
  attachments: ReportProblemAttachment[];
  status: ReportProblemStatus;
  createdAt: Date;
  updatedAt: Date;
};

const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB
const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

@Injectable()
export class ReportProblemService {
  constructor(
    @InjectModel(ReportProblem.name)
    private readonly reportModel: Model<ReportProblem>,
    private readonly cloudinary: CloudinaryService,
    private readonly config: ConfigService,
  ) {}

  async create(
    reporterId: string,
    dto: CreateReportProblemDto,
    files: UploadedFile[] = [],
  ): Promise<ReportProblemResponse> {
    const description = dto.description?.trim();
    if (!description) {
      throw new BadRequestException('Description is required');
    }

    if (files.length > 5) {
      throw new BadRequestException('You can attach up to 5 files');
    }

    if (files.some((file) => (file.size ?? 0) > MAX_FILE_BYTES)) {
      throw new BadRequestException('Each file must be <= 100MB');
    }

    const last = await this.reportModel
      .findOne({ userId: new Types.ObjectId(reporterId) })
      .sort({ createdAt: -1 })
      .select('createdAt')
      .lean();

    if (last?.createdAt) {
      const elapsed = Date.now() - last.createdAt.getTime();
      const remaining = COOLDOWN_MS - elapsed;
      if (remaining > 0) {
        throw new HttpException(
          {
            message: 'Please wait before sending another report.',
            retryAfterMs: remaining,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const attachments = await this.uploadAttachments(reporterId, files);

    const doc = await this.reportModel.create({
      reporterId: new Types.ObjectId(reporterId),
      userId: new Types.ObjectId(reporterId),
      description,
      attachments,
      status: 'open',
    });

    return this.toResponse(doc);
  }

  private async uploadAttachments(
    reporterId: string,
    files: UploadedFile[],
  ): Promise<ReportProblemAttachment[]> {
    if (!files?.length) return [];

    const now = new Date();
    const folderParts = [
      this.config.cloudinaryFolder,
      'reportproblem',
      reporterId,
      now.getFullYear().toString(),
      `${now.getMonth() + 1}`.padStart(2, '0'),
    ].filter(Boolean);
    const folder = folderParts.join('/');

    const uploads = await Promise.all(
      files.map(async (file) => {
        const resourceType = this.resolveResourceType(file.mimetype);
        if (!resourceType) {
          throw new BadRequestException(
            'Only image or video attachments are allowed',
          );
        }

        const upload = await this.cloudinary.uploadBuffer({
          buffer: file.buffer,
          folder,
          resourceType,
          overwrite: false,
        });

        return {
          url: upload.url,
          secureUrl: upload.secureUrl,
          publicId: upload.publicId,
          resourceType: upload.resourceType,
          bytes: upload.bytes,
          format: upload.format,
          width: upload.width,
          height: upload.height,
          duration: upload.duration,
        } satisfies ReportProblemAttachment;
      }),
    );

    return uploads;
  }

  private resolveResourceType(mimetype: string | undefined | null) {
    if (!mimetype) return null;
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    return null;
  }

  private toResponse(doc: ReportProblem): ReportProblemResponse {
    return {
      id: doc.id,
      reporterId: doc.reporterId.toString(),
      userId: doc.userId.toString(),
      description: doc.description,
      attachments: doc.attachments ?? [],
      status: doc.status,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
