import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Livestream, LivestreamSchema } from './livestream.schema';
import { LivestreamService } from './livestream.service';
import { LivestreamController } from './livestream.controller';
import { LivekitModule } from '../livekit/livekit.module';
import { Profile, ProfileSchema } from '../profiles/profile.schema';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    LivekitModule,
    NotificationsModule,
    MongooseModule.forFeature([
      {
        name: Livestream.name,
        schema: LivestreamSchema,
      },
      {
        name: Profile.name,
        schema: ProfileSchema,
      },
    ]),
  ],
  providers: [LivestreamService],
  controllers: [LivestreamController],
})
export class LivestreamModule {}
