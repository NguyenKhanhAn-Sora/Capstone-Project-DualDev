import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Comment, CommentSchema } from '../comment/comment.schema';
import { Post, PostSchema } from '../posts/post.schema';
import { ReportCommentController } from './reportcomment.controller';
import { ReportComment, ReportCommentSchema } from './reportcomment.schema';
import { ReportCommentService } from './reportcomment.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ReportComment.name, schema: ReportCommentSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: Post.name, schema: PostSchema },
    ]),
  ],
  controllers: [ReportCommentController],
  providers: [ReportCommentService],
})
export class ReportCommentModule {}
