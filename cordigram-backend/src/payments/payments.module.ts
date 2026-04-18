import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentsController } from './payments.controller';
import {
  PaymentTransaction,
  PaymentTransactionSchema,
} from './payment-transaction.schema';
import { PaymentsService } from './payments.service';
import { CampaignExpirySchedulerService } from './campaign-expiry-scheduler.service';
import { Post, PostSchema } from '../posts/post.schema';
import {
  AdEngagementEvent,
  AdEngagementEventSchema,
} from './ad-engagement-event.schema';
import {
  PostInteraction,
  PostInteractionSchema,
} from '../posts/post-interaction.schema';
import { Comment, CommentSchema } from '../comment/comment.schema';
import { BoostModule } from '../boost/boost.module';

@Module({
  imports: [
    BoostModule,
    MongooseModule.forFeature([
      { name: PaymentTransaction.name, schema: PaymentTransactionSchema },
      { name: Post.name, schema: PostSchema },
      { name: AdEngagementEvent.name, schema: AdEngagementEventSchema },
      { name: PostInteraction.name, schema: PostInteractionSchema },
      { name: Comment.name, schema: CommentSchema },
    ]),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, CampaignExpirySchedulerService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
