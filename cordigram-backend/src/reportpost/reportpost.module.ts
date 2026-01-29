import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Post, PostSchema } from '../posts/post.schema';
import { ReportPostController } from './reportpost.controller';
import { ReportPost, ReportPostSchema } from './reportpost.schema';
import { ReportPostService } from './reportpost.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ReportPost.name, schema: ReportPostSchema },
      { name: Post.name, schema: PostSchema },
    ]),
  ],
  controllers: [ReportPostController],
  providers: [ReportPostService],
})
export class ReportPostModule {}
