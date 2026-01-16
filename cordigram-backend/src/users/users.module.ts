<<<<<<< HEAD
import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './user.schema';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AuthModule } from '../auth/auth.module';
=======
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './user.schema';
import { UsersService } from './users.service';
>>>>>>> origin/Cordigram-social-chat

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
<<<<<<< HEAD
    forwardRef(() => AuthModule),
  ],
  controllers: [UsersController],
=======
  ],
>>>>>>> origin/Cordigram-social-chat
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
