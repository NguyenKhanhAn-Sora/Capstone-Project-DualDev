import { Controller, Get, Param, UseGuards, Request } from '@nestjs/common';
import { EventsService } from './events.service';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';

@Controller('events')
export class EventsPublicController {
  constructor(private readonly eventsService: EventsService) {}

  @Get(':serverId/:eventId')
  @UseGuards(OptionalJwtAuthGuard)
  async getEventPreview(
    @Param('serverId') serverId: string,
    @Param('eventId') eventId: string,
    @Request() req: any,
  ) {
    const userId = req.user?.userId;
    return this.eventsService.getEventPreview(serverId, eventId, userId);
  }
}
