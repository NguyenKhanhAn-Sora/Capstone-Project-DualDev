import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ServerEvent, ServerEventSchema } from './event.schema';
import { Server, ServerSchema } from '../servers/server.schema';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { EventsPublicController } from './events-public.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ServerEvent.name, schema: ServerEventSchema },
      { name: Server.name, schema: ServerSchema },
    ]),
  ],
  providers: [EventsService],
  controllers: [EventsController, EventsPublicController],
  exports: [EventsService],
})
export class EventsModule {}
