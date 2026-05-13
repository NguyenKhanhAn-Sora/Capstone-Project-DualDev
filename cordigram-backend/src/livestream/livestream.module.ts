import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Livestream, LivestreamSchema } from './livestream.schema';
import { LivestreamService } from './livestream.service';
import { LivestreamController } from './livestream.controller';
import { LivekitModule } from '../livekit/livekit.module';
import { Profile, ProfileSchema } from '../profiles/profile.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { IvsService } from './ivs.service';
import { LivestreamMute, LivestreamMuteSchema } from './livestream-mute.schema';
import { LivestreamMuteService } from './livestream-mute.service';
import { Block, BlockSchema } from '../users/block.schema';
import { Follow, FollowSchema } from '../users/follow.schema';

@Module({
  imports: [
    LivekitModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: Livestream.name, schema: LivestreamSchema },
      { name: Profile.name, schema: ProfileSchema },
      { name: LivestreamMute.name, schema: LivestreamMuteSchema },
      { name: Block.name, schema: BlockSchema },
      { name: Follow.name, schema: FollowSchema },
    ]),
  ],
  providers: [LivestreamService, IvsService, LivestreamMuteService],
  controllers: [LivestreamController],
})
export class LivestreamModule {}
