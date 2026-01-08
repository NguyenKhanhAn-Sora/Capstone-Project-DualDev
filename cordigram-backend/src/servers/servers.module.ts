import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ServersService } from './servers.service';
import { ServersController } from './servers.controller';
import { Server, ServerSchema } from './server.schema';
import { Channel, ChannelSchema } from '../channels/channel.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Server.name, schema: ServerSchema },
      { name: Channel.name, schema: ChannelSchema },
    ]),
  ],
  providers: [ServersService],
  controllers: [ServersController],
  exports: [ServersService],
})
export class ServersModule {}
