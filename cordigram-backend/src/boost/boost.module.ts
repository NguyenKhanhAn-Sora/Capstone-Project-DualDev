import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  BoostEntitlement,
  BoostEntitlementSchema,
} from './boost-entitlement.schema';
import { BoostService } from './boost.service';
import { DirectMessagesModule } from '../direct-messages/direct-messages.module';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BoostEntitlement.name, schema: BoostEntitlementSchema },
    ]),
    forwardRef(() => DirectMessagesModule),
    forwardRef(() => MessagesModule),
  ],
  providers: [BoostService],
  exports: [BoostService],
})
export class BoostModule {}
