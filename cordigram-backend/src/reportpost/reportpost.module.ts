import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Post, PostSchema } from '../posts/post.schema';
import { Profile, ProfileSchema } from '../profiles/profile.schema';
import { ReportPostController } from './reportpost.controller';
import { ReportPost, ReportPostSchema } from './reportpost.schema';
import { ReportPostService } from './reportpost.service';
import { ActivityModule } from '../activity/activity.module';
import { User, UserSchema } from '../users/user.schema';
import {
  ModerationAction,
  ModerationActionSchema,
} from '../moderation/moderation-action.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ReportPost.name, schema: ReportPostSchema },
      { name: Post.name, schema: PostSchema },
      { name: Profile.name, schema: ProfileSchema },
      { name: User.name, schema: UserSchema },
      { name: ModerationAction.name, schema: ModerationActionSchema },
    ]),
    ActivityModule,
  ],
  controllers: [ReportPostController],
  providers: [ReportPostService],
})
export class ReportPostModule {}
