import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { Comment, CommentSchema } from './comment.schema';
import { CommentLike, CommentLikeSchema } from './comment-like.schema';
import { Post, PostSchema } from '../posts/post.schema';
import { Profile, ProfileSchema } from '../profiles/profile.schema';
import { Follow, FollowSchema } from '../users/follow.schema';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { LinkPreviewService } from './link-preview.service';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActivityModule } from '../activity/activity.module';
import { User, UserSchema } from '../users/user.schema';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => UsersModule),
    ProfilesModule,
    CloudinaryModule,
    NotificationsModule,
    ActivityModule,
    MongooseModule.forFeature([
      { name: Comment.name, schema: CommentSchema },
      { name: CommentLike.name, schema: CommentLikeSchema },
      { name: Post.name, schema: PostSchema },
      { name: User.name, schema: UserSchema },
      { name: Profile.name, schema: ProfileSchema },
      { name: Follow.name, schema: FollowSchema },
    ]),
  ],
  controllers: [CommentsController],
  providers: [CommentsService, LinkPreviewService],
  exports: [CommentsService],
})
export class CommentsModule {}
