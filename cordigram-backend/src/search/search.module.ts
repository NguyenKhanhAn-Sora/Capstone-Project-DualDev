import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { HashtagsModule } from '../hashtags/hashtags.module';
import { PostsModule } from '../posts/posts.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { UsersModule } from '../users/users.module';
import { Post, PostSchema } from '../posts/post.schema';
import {
  PostInteraction,
  PostInteractionSchema,
} from '../posts/post-interaction.schema';
import { Follow, FollowSchema } from '../users/follow.schema';
import { Profile, ProfileSchema } from '../profiles/profile.schema';
import { SearchHistory, SearchHistorySchema } from './search-history.schema';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    ProfilesModule,
    HashtagsModule,
    PostsModule,
    MongooseModule.forFeature([
      { name: SearchHistory.name, schema: SearchHistorySchema },
      { name: Post.name, schema: PostSchema },
      { name: PostInteraction.name, schema: PostInteractionSchema },
      { name: Follow.name, schema: FollowSchema },
      { name: Profile.name, schema: ProfileSchema },
    ]),
  ],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
