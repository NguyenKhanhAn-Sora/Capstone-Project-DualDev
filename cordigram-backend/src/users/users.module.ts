import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './user.schema';
import { Follow, FollowSchema } from './follow.schema';
import { Block, BlockSchema } from './block.schema';
import { Ignored, IgnoredSchema } from './ignored.schema';
import { MentionMute, MentionMuteSchema } from './mention-mute.schema';
import { Profile, ProfileSchema } from '../profiles/profile.schema';
import {
  UserTasteProfile,
  UserTasteProfileSchema,
} from '../explore/user-taste.schema';
import { Server, ServerSchema } from '../servers/server.schema';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { BlocksService } from './blocks.service';
import { IgnoredService } from './ignored.service';
import { MentionMuteService } from './mention-mute.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OtpModule } from '../otp/otp.module';
import { Session, SessionSchema } from '../auth/session.schema';
import { ActivityModule } from '../activity/activity.module';
import {
  ModerationAction,
  ModerationActionSchema,
} from '../moderation/moderation-action.schema';
import { Post, PostSchema } from '../posts/post.schema';
import { Comment, CommentSchema } from '../comment/comment.schema';
import { ActivityLog, ActivityLogSchema } from '../activity/activity.schema';
import { ReportPost, ReportPostSchema } from '../reportpost/reportpost.schema';
import {
  ReportComment,
  ReportCommentSchema,
} from '../reportcomment/reportcomment.schema';
import { ReportUser, ReportUserSchema } from '../reportuser/reportuser.schema';
import {
  DirectMessage,
  DirectMessageSchema,
} from '../direct-messages/direct-message.schema';
import { StrikeDecaySchedulerService } from './strike-decay-scheduler.service';
import { BoostModule } from '../boost/boost.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Follow.name, schema: FollowSchema },
      { name: Block.name, schema: BlockSchema },
      { name: Ignored.name, schema: IgnoredSchema },
      { name: MentionMute.name, schema: MentionMuteSchema },
      { name: Profile.name, schema: ProfileSchema },
      { name: UserTasteProfile.name, schema: UserTasteProfileSchema },
      { name: Server.name, schema: ServerSchema },
      { name: Session.name, schema: SessionSchema },
      { name: ModerationAction.name, schema: ModerationActionSchema },
      { name: Post.name, schema: PostSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: ActivityLog.name, schema: ActivityLogSchema },
      { name: ReportPost.name, schema: ReportPostSchema },
      { name: ReportComment.name, schema: ReportCommentSchema },
      { name: ReportUser.name, schema: ReportUserSchema },
      { name: DirectMessage.name, schema: DirectMessageSchema },
    ]),
    forwardRef(() => AuthModule),
    NotificationsModule,
    OtpModule,
    ActivityModule,
    forwardRef(() => BoostModule),
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    BlocksService,
    IgnoredService,
    MentionMuteService,
    StrikeDecaySchedulerService,
  ],
  exports: [UsersService, BlocksService, IgnoredService, MentionMuteService],
})
export class UsersModule {}
