import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { MessageSearchController } from './message-search.controller';
import { ChannelMessagesGateway } from './channel-messages.gateway';
import { Message, MessageSchema } from './message.schema';
import {
  ChannelReadState,
  ChannelReadStateSchema,
} from './channel-read-state.schema';
import { Channel, ChannelSchema } from '../channels/channel.schema';
import { Profile, ProfileSchema } from '../profiles/profile.schema';
import { Server, ServerSchema } from '../servers/server.schema';
import { UsersModule } from '../users/users.module';
import { RolesModule } from '../roles/roles.module';
import { InboxSeen, InboxSeenSchema } from '../inbox/inbox-seen.schema';
import { UserServer, UserServerSchema } from '../access/user-server.schema';

@Module({
  imports: [
    UsersModule,
    forwardRef(() => RolesModule),
    MongooseModule.forFeature([
      { name: Message.name, schema: MessageSchema },
      { name: ChannelReadState.name, schema: ChannelReadStateSchema },
      { name: Channel.name, schema: ChannelSchema },
      { name: Profile.name, schema: ProfileSchema },
      { name: Server.name, schema: ServerSchema },
      { name: InboxSeen.name, schema: InboxSeenSchema },
      { name: UserServer.name, schema: UserServerSchema },
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your_secret_key',
    }),
  ],
  providers: [MessagesService, ChannelMessagesGateway],
  controllers: [MessageSearchController, MessagesController],
  exports: [MessagesService, ChannelMessagesGateway],
})
export class MessagesModule {}
