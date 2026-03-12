import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Comment, CommentSchema } from '../comment/comment.schema';
import { Post, PostSchema } from '../posts/post.schema';
import { ReportCommentController } from './reportcomment.controller';
import { ReportComment, ReportCommentSchema } from './reportcomment.schema';
import { ReportCommentService } from './reportcomment.service';
import { User, UserSchema } from '../users/user.schema';
import {
  ModerationAction,
  ModerationActionSchema,
} from '../moderation/moderation-action.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ReportComment.name, schema: ReportCommentSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: Post.name, schema: PostSchema },
      { name: User.name, schema: UserSchema },
      { name: ModerationAction.name, schema: ModerationActionSchema },
    ]),
  ],
  controllers: [ReportCommentController],
  providers: [ReportCommentService],
})
export class ReportCommentModule {}
