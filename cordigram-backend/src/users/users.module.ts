import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './user.schema';
import { Follow, FollowSchema } from './follow.schema';
import { Block, BlockSchema } from './block.schema';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { BlocksService } from './blocks.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Follow.name, schema: FollowSchema },
      { name: Block.name, schema: BlockSchema },
    ]),
    forwardRef(() => AuthModule),
  ],
  controllers: [UsersController],
  providers: [UsersService, BlocksService],
  exports: [UsersService, BlocksService],
})
export class UsersModule {}
