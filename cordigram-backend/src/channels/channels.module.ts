import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChannelsService } from './channels.service';
import { ChannelsController } from './channels.controller';
import { Channel, ChannelSchema } from './channel.schema';
import {
  ChannelCategory,
  ChannelCategorySchema,
} from './channel-category.schema';
import { Server, ServerSchema } from '../servers/server.schema';
import { RolesModule } from '../roles/roles.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Channel.name, schema: ChannelSchema },
      { name: ChannelCategory.name, schema: ChannelCategorySchema },
      { name: Server.name, schema: ServerSchema },
    ]),
    forwardRef(() => RolesModule),
    AuditLogModule,
  ],
  providers: [ChannelsService],
  controllers: [ChannelsController],
  exports: [ChannelsService],
})
export class ChannelsModule {}
