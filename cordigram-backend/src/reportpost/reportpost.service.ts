import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Post } from '../posts/post.schema';
import { Profile } from '../profiles/profile.schema';
import { CreateReportPostDto } from './dto/create-reportpost.dto';
import { ReportPost, ReportPostReasons } from './reportpost.schema';
import { ActivityLogService } from '../activity/activity.service';

@Injectable()
export class ReportPostService {
  constructor(
    @InjectModel(ReportPost.name)
    private readonly reportPostModel: Model<ReportPost>,
    @InjectModel(Post.name)
    private readonly postModel: Model<Post>,
    @InjectModel(Profile.name)
    private readonly profileModel: Model<Profile>,
    private readonly activityLogService: ActivityLogService,
  ) {}

  async create(
    reporterId: Types.ObjectId | string,
    postId: string,
    dto: CreateReportPostDto,
  ): Promise<ReportPost> {
    const reasonList = ReportPostReasons[dto.category];
    if (!reasonList || !reasonList.includes(dto.reason)) {
      throw new BadRequestException('Invalid report reason');
    }

    const post = await this.postModel
      .findById(postId)
      .select('authorId kind content media')
      .lean();
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const existing = await this.reportPostModel.findOne({ reporterId, postId });
    if (existing) {
      existing.category = dto.category;
      existing.reason = dto.reason;
      existing.note = dto.note ?? null;
      return existing.save();
    }

    const created = await this.reportPostModel.create({
      reporterId,
      postId,
      category: dto.category,
      reason: dto.reason,
      note: dto.note ?? null,
    });

    await this.postModel.updateOne(
      { _id: postId },
      { $inc: { 'stats.reports': 1 } },
    );

    const authorProfile = post.authorId
      ? await this.profileModel
          .findOne({ userId: post.authorId })
          .select('displayName username avatarUrl')
          .lean()
      : null;

    await this.activityLogService.log({
      userId: reporterId,
      type: 'report_post',
      postId,
      postKind: post.kind ?? 'post',
      meta: {
        postCaption: post.content ?? null,
        postMediaUrl: post.media?.[0]?.url ?? null,
        postAuthorId: post.authorId?.toString?.() ?? null,
        postAuthorDisplayName: authorProfile?.displayName ?? null,
        postAuthorUsername: authorProfile?.username ?? null,
        postAuthorAvatarUrl: authorProfile?.avatarUrl ?? null,
        reportCategory: dto.category,
        reportReason: dto.reason,
      },
    });

    return created;
  }
}
