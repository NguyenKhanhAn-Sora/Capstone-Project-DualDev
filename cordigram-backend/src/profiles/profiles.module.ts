import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Profile, ProfileSchema } from './profile.schema';
import { ProfilesService } from './profiles.service';
import { ProfilesController } from './profiles.controller';
import { Follow, FollowSchema } from '../users/follow.schema';
import { Post, PostSchema } from '../posts/post.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Profile.name, schema: ProfileSchema },
      { name: Follow.name, schema: FollowSchema },
      { name: Post.name, schema: PostSchema },
    ]),
  ],
  providers: [ProfilesService],
  controllers: [ProfilesController],
  exports: [ProfilesService],
})
export class ProfilesModule {}
