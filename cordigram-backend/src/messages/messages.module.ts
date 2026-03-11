import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { ChannelMessagesGateway } from './channel-messages.gateway';
import { Message, MessageSchema } from './message.schema';
import { Channel, ChannelSchema } from '../channels/channel.schema';
import { Profile, ProfileSchema } from '../profiles/profile.schema';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: Message.name, schema: MessageSchema },
      { name: Channel.name, schema: ChannelSchema },
      { name: Profile.name, schema: ProfileSchema },
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your_secret_key',
    }),
  ],
  providers: [MessagesService, ChannelMessagesGateway],
  controllers: [MessagesController],
  exports: [MessagesService],
})
export class MessagesModule {}
