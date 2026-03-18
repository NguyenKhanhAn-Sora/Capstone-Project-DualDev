import { NotificationsModule } from '../notifications/notifications.module';
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
import { Hashtag, HashtagSchema } from '../hashtags/hashtag.schema';
import { ExploreController } from '../explore/explore.controller';
import {
  UserTasteProfile,
  UserTasteProfileSchema,
} from '../explore/user-taste.schema';
import {
  PostImpressionEvent,
  PostImpressionEventSchema,
} from '../explore/impression-event.schema';
import { ActivityModule } from '../activity/activity.module';
import { PostSchedulerService } from './post-scheduler.service';
import { User, UserSchema } from '../users/user.schema';
import { MediaModerationService } from './media-moderation.service';
import {
  ModerationAction,
  ModerationActionSchema,
} from '../moderation/moderation-action.schema';
import {
  PaymentTransaction,
  PaymentTransactionSchema,
} from '../payments/payment-transaction.schema';

@Module({
  imports: [
    AuthModule,
    CloudinaryModule,
    UsersModule,
    NotificationsModule,
    ActivityModule,
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: PostInteraction.name, schema: PostInteractionSchema },
      { name: Follow.name, schema: FollowSchema },
      { name: Profile.name, schema: ProfileSchema },
      { name: Hashtag.name, schema: HashtagSchema },
      { name: UserTasteProfile.name, schema: UserTasteProfileSchema },
      { name: PostImpressionEvent.name, schema: PostImpressionEventSchema },
      { name: User.name, schema: UserSchema },
      { name: ModerationAction.name, schema: ModerationActionSchema },
      { name: PaymentTransaction.name, schema: PaymentTransactionSchema },
    ]),
  ],
  controllers: [PostsController, ReelsController, ExploreController],
  providers: [PostsService, PostSchedulerService, MediaModerationService],
  exports: [PostsService],
})
export class PostsModule {}
