import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { MailModule } from './mail/mail.module';
import { OtpModule } from './otp/otp.module';
import { UsersModule } from './users/users.module';
import { ProfilesModule } from './profiles/profiles.module';
import { AuthModule } from './auth/auth.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { PostsModule } from './posts/posts.module';
import { ReportProblemModule } from './reportproblem/reportproblem.module';
import { CommentsModule } from './comment/comments.module';
import { ReportPostModule } from './reportpost/reportpost.module';
import { ReportCommentModule } from './reportcomment/reportcomment.module';
import { ReportUserModule } from './reportuser/reportuser.module';
import { CompaniesModule } from './companies/companies.module';
import { HashtagsModule } from './hashtags/hashtags.module';
import { SearchModule } from './search/search.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ServersModule } from './servers/servers.module';
import { ChannelsModule } from './channels/channels.module';
import { MessagesModule } from './messages/messages.module';
import { DirectMessagesModule } from './direct-messages/direct-messages.module';
import { FollowsModule } from './follows/follows.module';
import { PollsModule } from './polls/polls.module';
import { LivekitModule } from './livekit/livekit.module';
import { ActivityModule } from './activity/activity.module';
import { AdminModule } from './admin/admin.module';
import { EventsModule } from './events/events.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    MailModule,
    OtpModule,
    UsersModule,
    ProfilesModule,
    AuthModule,
    CloudinaryModule,
    PostsModule,
    CommentsModule,
    CompaniesModule,
    HashtagsModule,
    SearchModule,
    ReportProblemModule,
    ReportPostModule,
    ReportCommentModule,
    ReportUserModule,
    NotificationsModule,
    ServersModule,
    ChannelsModule,
    MessagesModule,
    DirectMessagesModule,
    FollowsModule,
    PollsModule,
    LivekitModule,
    ActivityModule,
    AdminModule,
    EventsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
