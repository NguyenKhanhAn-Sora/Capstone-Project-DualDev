import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ServersService } from './servers.service';
import { ServersController } from './servers.controller';
import { Server, ServerSchema } from './server.schema';
import {
  ServerNotification,
  ServerNotificationSchema,
} from './server-notification.schema';
import { Channel, ChannelSchema } from '../channels/channel.schema';
import {
  ChannelCategory,
  ChannelCategorySchema,
} from '../channels/channel-category.schema';
import { User, UserSchema } from '../users/user.schema';
import { Profile, ProfileSchema } from '../profiles/profile.schema';
import {
  ServerInvite,
  ServerInviteSchema,
} from '../server-invites/server-invite.schema';
import { Message, MessageSchema } from '../messages/message.schema';
import { RolesModule } from '../roles/roles.module';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Server.name, schema: ServerSchema },
      { name: Channel.name, schema: ChannelSchema },
      { name: ChannelCategory.name, schema: ChannelCategorySchema },
      { name: User.name, schema: UserSchema },
      { name: Profile.name, schema: ProfileSchema },
      { name: ServerInvite.name, schema: ServerInviteSchema },
      { name: ServerNotification.name, schema: ServerNotificationSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    forwardRef(() => RolesModule),
    MessagesModule,
  ],
  providers: [ServersService],
  controllers: [ServersController],
  exports: [ServersService, MongooseModule],
})
export class ServersModule {}
