import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User, UserSchema } from '../users/user.schema';
import { Post, PostSchema } from '../posts/post.schema';
import {
  PostInteraction,
  PostInteractionSchema,
} from '../posts/post-interaction.schema';
import { LivekitModule } from '../livekit/livekit.module';
import { ReportPost, ReportPostSchema } from '../reportpost/reportpost.schema';
import {
  ReportComment,
  ReportCommentSchema,
} from '../reportcomment/reportcomment.schema';
import { ReportUser, ReportUserSchema } from '../reportuser/reportuser.schema';
import { Profile, ProfileSchema } from '../profiles/profile.schema';
import { Comment, CommentSchema } from '../comment/comment.schema';
import {
  ModerationAction,
  ModerationActionSchema,
} from '../moderation/moderation-action.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { InteractionMuteSchedulerService } from './interaction-mute-scheduler.service';
import { UsersModule } from '../users/users.module';
import { CommentsModule } from '../comment/comments.module';
import {
  PaymentTransaction,
  PaymentTransactionSchema,
} from '../payments/payment-transaction.schema';
import {
  AdEngagementEvent,
  AdEngagementEventSchema,
} from '../payments/ad-engagement-event.schema';
import {
  ReportProblem,
  ReportProblemSchema,
} from '../reportproblem/reportproblem.schema';
import { Server, ServerSchema } from '../servers/server.schema';
import { Channel, ChannelSchema } from '../channels/channel.schema';
import {
  ChannelCategory,
  ChannelCategorySchema,
} from '../channels/channel-category.schema';
import {
  ServerNotification,
  ServerNotificationSchema,
} from '../servers/server-notification.schema';
import { Message, MessageSchema } from '../messages/message.schema';
import { Role, RoleSchema } from '../roles/role.schema';
import {
  UserServer,
  UserServerSchema,
} from '../access/user-server.schema';
import {
  CommunityDiscoveryHistory,
  CommunityDiscoveryHistorySchema,
} from './community-discovery-history.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    MongooseModule.forFeature([{ name: Post.name, schema: PostSchema }]),
    MongooseModule.forFeature([
      { name: PostInteraction.name, schema: PostInteractionSchema },
    ]),
    MongooseModule.forFeature([{ name: Comment.name, schema: CommentSchema }]),
    MongooseModule.forFeature([
      { name: ReportPost.name, schema: ReportPostSchema },
      { name: ReportComment.name, schema: ReportCommentSchema },
      { name: ReportUser.name, schema: ReportUserSchema },
    ]),
    MongooseModule.forFeature([
      { name: ModerationAction.name, schema: ModerationActionSchema },
    ]),
    MongooseModule.forFeature([{ name: Profile.name, schema: ProfileSchema }]),
    MongooseModule.forFeature([
      { name: PaymentTransaction.name, schema: PaymentTransactionSchema },
      { name: AdEngagementEvent.name, schema: AdEngagementEventSchema },
    ]),
    MongooseModule.forFeature([
      { name: ReportProblem.name, schema: ReportProblemSchema },
      { name: Server.name, schema: ServerSchema },
      { name: Channel.name, schema: ChannelSchema },
      { name: ChannelCategory.name, schema: ChannelCategorySchema },
      { name: ServerNotification.name, schema: ServerNotificationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Role.name, schema: RoleSchema },
      { name: UserServer.name, schema: UserServerSchema },
      {
        name: CommunityDiscoveryHistory.name,
        schema: CommunityDiscoveryHistorySchema,
      },
    ]),
    LivekitModule,
    NotificationsModule,
    UsersModule,
    CommentsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, InteractionMuteSchedulerService],
})
export class AdminModule {}
