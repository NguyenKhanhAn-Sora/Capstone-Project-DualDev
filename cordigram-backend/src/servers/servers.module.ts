import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ServersService } from './servers.service';
import { ServersController } from './servers.controller';
import { Server, ServerSchema } from './server.schema';
import { Channel, ChannelSchema } from '../channels/channel.schema';
import { User, UserSchema } from '../users/user.schema';
import { Profile, ProfileSchema } from '../profiles/profile.schema';
import { ServerInvite, ServerInviteSchema } from '../server-invites/server-invite.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Server.name, schema: ServerSchema },
      { name: Channel.name, schema: ChannelSchema },
      { name: User.name, schema: UserSchema },
      { name: Profile.name, schema: ProfileSchema },
      { name: ServerInvite.name, schema: ServerInviteSchema },
    ]),
  ],
  providers: [ServersService],
  controllers: [ServersController],
  exports: [ServersService],
})
export class ServersModule {}
