import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Comment } from '../comment/comment.schema';
import { Post } from '../posts/post.schema';
import { CreateReportCommentDto } from './dto/create-reportcomment.dto';
import { ReportComment, ReportCommentReasons } from './reportcomment.schema';

@Injectable()
export class ReportCommentService {
  constructor(
    @InjectModel(ReportComment.name)
    private readonly reportCommentModel: Model<ReportComment>,
    @InjectModel(Comment.name)
    private readonly commentModel: Model<Comment>,
    @InjectModel(Post.name)
    private readonly postModel: Model<Post>,
  ) {}

  async create(
    reporterId: Types.ObjectId | string,
    commentId: string,
    dto: CreateReportCommentDto,
  ): Promise<ReportComment> {
    const reasonList = ReportCommentReasons[dto.category];
    if (!reasonList || !reasonList.includes(dto.reason)) {
      throw new BadRequestException('Invalid report reason');
    }

    if (!Types.ObjectId.isValid(commentId)) {
      throw new BadRequestException('Invalid commentId');
    }

    const comment = await this.commentModel
      .findOne({ _id: commentId, deletedAt: null })
      .select('_id postId')
      .lean();

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    const postId = comment.postId;

    const existing = await this.reportCommentModel.findOne({
      reporterId,
      commentId,
    });

    if (existing) {
      existing.category = dto.category;
      existing.reason = dto.reason;
      existing.note = dto.note ?? null;
      return existing.save();
    }

    const created = await this.reportCommentModel.create({
      reporterId,
      commentId,
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
