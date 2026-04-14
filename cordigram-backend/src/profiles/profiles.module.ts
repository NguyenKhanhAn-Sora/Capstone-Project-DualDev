import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Profile, ProfileSchema } from './profile.schema';
import { ProfilesService } from './profiles.service';
import { ProfilesController } from './profiles.controller';
import { Follow, FollowSchema } from '../users/follow.schema';
import { Post, PostSchema } from '../posts/post.schema';
import { CompaniesModule } from '../companies/companies.module';
import { User, UserSchema } from '../users/user.schema';
import { Server, ServerSchema } from '../servers/server.schema';
import { Block, BlockSchema } from '../users/block.schema';

@Module({
  imports: [
    CompaniesModule,
    MongooseModule.forFeature([
      { name: Profile.name, schema: ProfileSchema },
      { name: Follow.name, schema: FollowSchema },
      { name: Post.name, schema: PostSchema },
      { name: User.name, schema: UserSchema },
      { name: Server.name, schema: ServerSchema },
      { name: Block.name, schema: BlockSchema },
    ]),
  ],
  providers: [ProfilesService],
  controllers: [ProfilesController],
  exports: [ProfilesService],
})
export class ProfilesModule {}
