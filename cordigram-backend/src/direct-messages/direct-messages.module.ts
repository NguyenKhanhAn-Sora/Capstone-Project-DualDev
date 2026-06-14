import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { DirectMessagesService } from './direct-messages.service';
import { LinkPreviewService } from '../comment/link-preview.service';
import { DirectMessagesController } from './direct-messages.controller';
import { DirectMessagesGateway } from './direct-messages.gateway';
import { DirectMessage, DirectMessageSchema } from './direct-message.schema';
import {
  DmConversationPreference,
  DmConversationPreferenceSchema,
} from './dm-conversation-preference.schema';
import { DmConversationPreferenceService } from './dm-conversation-preference.service';
import { User, UserSchema } from '../users/user.schema';
import { Profile, ProfileSchema } from '../profiles/profile.schema';
import { Follow, FollowSchema } from '../users/follow.schema';
import { MessageReport, MessageReportSchema } from './message-report.schema';
import { UsersModule } from '../users/users.module';
import { MessagingProfilesModule } from '../messaging-profiles/messaging-profiles.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BoostModule } from '../boost/boost.module';
import { Server, ServerSchema } from '../servers/server.schema';

@Module({
  imports: [
    forwardRef(() => UsersModule),
    forwardRef(() => MessagingProfilesModule),
    forwardRef(() => BoostModule),
    NotificationsModule,
    MongooseModule.forFeature([
      { name: DirectMessage.name, schema: DirectMessageSchema },
      {
        name: DmConversationPreference.name,
        schema: DmConversationPreferenceSchema,
      },
      { name: User.name, schema: UserSchema },
      { name: Profile.name, schema: ProfileSchema },
      { name: Follow.name, schema: FollowSchema },
      { name: MessageReport.name, schema: MessageReportSchema },
      { name: Server.name, schema: ServerSchema },
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your_secret_key',
    }),
  ],
  providers: [
    DirectMessagesService,
    DirectMessagesGateway,
    LinkPreviewService,
    DmConversationPreferenceService,
  ],
  controllers: [DirectMessagesController],
  exports: [
    DirectMessagesService,
    DirectMessagesGateway,
    DmConversationPreferenceService,
  ],
})
export class DirectMessagesModule {}
