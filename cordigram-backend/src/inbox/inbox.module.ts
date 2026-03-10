import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InboxService } from './inbox.service';
import { InboxController } from './inbox.controller';
import { InboxSeen, InboxSeenSchema } from './inbox-seen.schema';
import { ServersModule } from '../servers/servers.module';
import { EventsModule } from '../events/events.module';
import { ServerInvitesModule } from '../server-invites/server-invites.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: InboxSeen.name, schema: InboxSeenSchema }]),
    ServersModule,
    EventsModule,
    ServerInvitesModule,
  ],
  providers: [InboxService],
  controllers: [InboxController],
})
export class InboxModule {}
