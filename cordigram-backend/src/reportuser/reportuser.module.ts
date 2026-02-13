import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReportUserController } from './reportuser.controller';
import { ReportUser, ReportUserSchema } from './reportuser.schema';
import { ReportUserService } from './reportuser.service';
import { User, UserSchema } from '../users/user.schema';
import { Profile, ProfileSchema } from '../profiles/profile.schema';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ReportUser.name, schema: ReportUserSchema },
      { name: User.name, schema: UserSchema },
      { name: Profile.name, schema: ProfileSchema },
    ]),
    ActivityModule,
  ],
  controllers: [ReportUserController],
  providers: [ReportUserService],
})
export class ReportUserModule {}
