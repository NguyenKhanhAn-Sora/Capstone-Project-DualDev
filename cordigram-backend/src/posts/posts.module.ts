import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { UsersModule } from '../users/users.module';
import { Post, PostSchema } from './post.schema';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { ReelsController } from './reels.controller';
import {
  PostInteraction,
  PostInteractionSchema,
} from './post-interaction.schema';
import { Follow, FollowSchema } from '../users/follow.schema';
import { Profile, ProfileSchema } from '../profiles/profile.schema';

@Module({
  imports: [
    AuthModule,
    CloudinaryModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: PostInteraction.name, schema: PostInteractionSchema },
      { name: Follow.name, schema: FollowSchema },
      { name: Profile.name, schema: ProfileSchema },
    ]),
  ],
  controllers: [PostsController, ReelsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
