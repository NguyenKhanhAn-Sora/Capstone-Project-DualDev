import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PollsController } from './polls.controller';
import { PollsService } from './polls.service';
import { Poll, PollSchema } from './poll.schema';
import { Follow, FollowSchema } from '../users/follow.schema';
import { Profile, ProfileSchema } from '../profiles/profile.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Poll.name, schema: PollSchema },
      { name: Follow.name, schema: FollowSchema },
      { name: Profile.name, schema: ProfileSchema },
    ]),
  ],
  controllers: [PollsController],
  providers: [PollsService],
  exports: [PollsService],
})
export class PollsModule {}
