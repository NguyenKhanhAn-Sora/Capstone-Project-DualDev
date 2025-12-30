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
    ReportProblemModule,
    ReportPostModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
