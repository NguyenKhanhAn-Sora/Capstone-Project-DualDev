import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Post, PostSchema } from '../posts/post.schema';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { CaptionService } from './caption.service';
import { CaptionQueueService } from './caption-queue.service';

@Module({
  imports: [
    CloudinaryModule,
    MongooseModule.forFeature([{ name: Post.name, schema: PostSchema }]),
  ],
  providers: [CaptionService, CaptionQueueService],
  exports: [CaptionQueueService],
})
export class CaptionsModule {}
