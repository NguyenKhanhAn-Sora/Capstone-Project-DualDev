import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('servers/:serverId/events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  async create(
    @Param('serverId') serverId: string,
    @Body() dto: CreateEventDto,
    @Request() req: any,
  ) {
    return this.eventsService.create(serverId, dto, req.user.userId);
  }

  @Get()
  async list(@Param('serverId') serverId: string) {
    const [active, upcoming] = await Promise.all([
      this.eventsService.getActiveByServer(serverId),
      this.eventsService.getUpcomingByServer(serverId),
    ]);
    return { active, upcoming };
  }

  @Get(':eventId')
  async getOne(
    @Param('serverId') serverId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.eventsService.getById(eventId);
  }

  @Post(':eventId/start')
  async start(
    @Param('serverId') serverId: string,
    @Param('eventId') eventId: string,
    @Request() req: any,
  ) {
    return this.eventsService.startEvent(serverId, eventId, req.user.userId);
  }

  @Post(':eventId/end')
  async end(
    @Param('serverId') serverId: string,
    @Param('eventId') eventId: string,
    @Request() req: any,
  ) {
    return this.eventsService.endEvent(serverId, eventId, req.user.userId);
  }
}
