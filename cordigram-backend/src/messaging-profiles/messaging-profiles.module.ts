import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  MessagingProfile,
  MessagingProfileSchema,
} from './messaging-profile.schema';
import { MessagingProfilesService } from './messaging-profiles.service';
import { MessagingProfilesController } from './messaging-profiles.controller';
import { Profile, ProfileSchema } from '../profiles/profile.schema';
import { User, UserSchema } from '../users/user.schema';
import { ProfilesModule } from '../profiles/profiles.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { ConfigModule } from '../config/config.module';
import { BoostModule } from '../boost/boost.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MessagingProfile.name, schema: MessagingProfileSchema },
      { name: Profile.name, schema: ProfileSchema },
      { name: User.name, schema: UserSchema },
    ]),
    forwardRef(() => ProfilesModule),
    CloudinaryModule,
    ConfigModule,
    forwardRef(() => BoostModule),
  ],
  providers: [MessagingProfilesService],
  controllers: [MessagingProfilesController],
  exports: [MessagingProfilesService],
})
export class MessagingProfilesModule {}
