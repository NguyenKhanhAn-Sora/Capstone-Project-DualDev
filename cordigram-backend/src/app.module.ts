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
import { ServersModule } from './servers/servers.module';
import { ChannelsModule } from './channels/channels.module';
import { MessagesModule } from './messages/messages.module';
import { FollowsModule } from './follows/follows.module';
import { CommentsModule } from './comment/comments.module';
import { ReportPostModule } from './reportpost/reportpost.module';
import { ReportCommentModule } from './reportcomment/reportcomment.module';

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
    ReportProblemModule,
    ServersModule,
    ChannelsModule,
    MessagesModule,
    FollowsModule,
    CommentsModule,
    ReportPostModule,
    ReportCommentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
