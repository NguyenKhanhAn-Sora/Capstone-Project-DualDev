import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ServerEvent, ServerEventSchema } from './event.schema';
import { Server, ServerSchema } from '../servers/server.schema';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { EventsPublicController } from './events-public.controller';
import { RolesModule } from '../roles/roles.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ServerEvent.name, schema: ServerEventSchema },
      { name: Server.name, schema: ServerSchema },
    ]),
    forwardRef(() => RolesModule),
  ],
  providers: [EventsService],
  controllers: [EventsController, EventsPublicController],
  exports: [EventsService],
})
export class EventsModule {}
