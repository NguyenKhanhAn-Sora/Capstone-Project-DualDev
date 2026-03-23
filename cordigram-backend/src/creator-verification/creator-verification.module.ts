import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CreatorVerificationRequest,
  CreatorVerificationRequestSchema,
} from './creator-verification.schema';
import { CreatorVerificationService } from './creator-verification.service';
import { CreatorVerificationController } from './creator-verification.controller';
import { User, UserSchema } from '../users/user.schema';
import { Profile, ProfileSchema } from '../profiles/profile.schema';
import { Post, PostSchema } from '../posts/post.schema';
import {
  ModerationAction,
  ModerationActionSchema,
} from '../moderation/moderation-action.schema';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  PaymentTransaction,
  PaymentTransactionSchema,
} from '../payments/payment-transaction.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: CreatorVerificationRequest.name,
        schema: CreatorVerificationRequestSchema,
      },
      { name: User.name, schema: UserSchema },
      { name: Profile.name, schema: ProfileSchema },
      { name: Post.name, schema: PostSchema },
      { name: PaymentTransaction.name, schema: PaymentTransactionSchema },
      { name: ModerationAction.name, schema: ModerationActionSchema },
    ]),
    MailModule,
    NotificationsModule,
  ],
  controllers: [CreatorVerificationController],
  providers: [CreatorVerificationService],
  exports: [CreatorVerificationService],
})
export class CreatorVerificationModule {}
