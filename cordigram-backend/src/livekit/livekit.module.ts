import { Module } from '@nestjs/common';
import { LivekitService } from './livekit.service';
import { LivekitController } from './livekit.controller';
import { ServersModule } from '../servers/servers.module';
import { ChannelsModule } from '../channels/channels.module';

@Module({
  imports: [ServersModule, ChannelsModule],
  controllers: [LivekitController],
  providers: [LivekitService],
  exports: [LivekitService],
})
export class LivekitModule {}
