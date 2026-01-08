import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Post } from '../posts/post.schema';
import { CreateReportPostDto } from './dto/create-reportpost.dto';
import { ReportPost, ReportPostReasons } from './reportpost.schema';

@Injectable()
export class ReportPostService {
  constructor(
    @InjectModel(ReportPost.name)
    private readonly reportPostModel: Model<ReportPost>,
    @InjectModel(Post.name)
    private readonly postModel: Model<Post>,
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

    const post = await this.postModel.findById(postId).select('_id');
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

    return created;
  }
}
