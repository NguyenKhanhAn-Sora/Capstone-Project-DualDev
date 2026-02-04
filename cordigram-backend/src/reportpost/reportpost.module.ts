import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Post, PostSchema } from '../posts/post.schema';
import { Profile, ProfileSchema } from '../profiles/profile.schema';
import { ReportPostController } from './reportpost.controller';
import { ReportPost, ReportPostSchema } from './reportpost.schema';
import { ReportPostService } from './reportpost.service';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ReportPost.name, schema: ReportPostSchema },
      { name: Post.name, schema: PostSchema },
      { name: Profile.name, schema: ProfileSchema },
    ]),
    ActivityModule,
  ],
  controllers: [ReportPostController],
  providers: [ReportPostService],
})
export class ReportPostModule {}
