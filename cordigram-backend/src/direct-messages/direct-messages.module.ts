import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { DirectMessagesService } from './direct-messages.service';
import { DirectMessagesController } from './direct-messages.controller';
import { DirectMessagesGateway } from './direct-messages.gateway';
import { DirectMessage, DirectMessageSchema } from './direct-message.schema';
import { User, UserSchema } from '../users/user.schema';
import { Profile, ProfileSchema } from '../profiles/profile.schema';
import { Follow, FollowSchema } from '../follows/follow.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DirectMessage.name, schema: DirectMessageSchema },
      { name: User.name, schema: UserSchema },
      { name: Profile.name, schema: ProfileSchema },
      { name: Follow.name, schema: FollowSchema },
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your_secret_key',
    }),
  ],
  providers: [DirectMessagesService, DirectMessagesGateway],
  controllers: [DirectMessagesController],
  exports: [DirectMessagesService, DirectMessagesGateway],
})
export class DirectMessagesModule {}
