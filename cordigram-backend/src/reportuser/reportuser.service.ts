import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../users/user.schema';
import { Profile } from '../profiles/profile.schema';
import { ActivityLogService } from '../activity/activity.service';
import { CreateReportUserDto } from './dto/create-reportuser.dto';
import { ReportUser, ReportUserReasons } from './reportuser.schema';

@Injectable()
export class ReportUserService {
  constructor(
    @InjectModel(ReportUser.name)
    private readonly reportUserModel: Model<ReportUser>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(Profile.name)
    private readonly profileModel: Model<Profile>,
    private readonly activityLogService: ActivityLogService,
  ) {}

  async create(
    reporterId: Types.ObjectId | string,
    targetUserId: string,
    dto: CreateReportUserDto,
  ): Promise<ReportUser> {
    const reasonList = ReportUserReasons[dto.category];
    if (!reasonList || !reasonList.includes(dto.reason)) {
      throw new BadRequestException('Invalid report reason');
    }

    if (!Types.ObjectId.isValid(targetUserId)) {
      throw new BadRequestException('Invalid targetUserId');
    }

    const target = await this.userModel
      .findById(targetUserId)
      .select('_id')
      .lean();
    if (!target) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.reportUserModel.findOne({
      reporterId,
      targetUserId,
    });

    if (existing) {
      existing.category = dto.category;
      existing.reason = dto.reason;
      existing.note = dto.note ?? null;
      return existing.save();
    }

    const created = await this.reportUserModel.create({
      reporterId,
      targetUserId,
      category: dto.category,
      reason: dto.reason,
      note: dto.note ?? null,
    });

    const targetProfile = await this.profileModel
      .findOne({ userId: targetUserId })
      .select('displayName username avatarUrl')
      .lean();

    await this.activityLogService.log({
      userId: reporterId,
      type: 'report_user',
      targetUserId,
      meta: {
        targetDisplayName: targetProfile?.displayName ?? null,
        targetUsername: targetProfile?.username ?? null,
        targetAvatarUrl: targetProfile?.avatarUrl ?? null,
        reportCategory: dto.category,
        reportReason: dto.reason,
      },
    });

    return created;
  }
}
