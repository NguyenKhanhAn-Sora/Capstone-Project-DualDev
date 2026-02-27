import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ServerEvent, EventFrequency } from './event.schema';
import { Server } from '../servers/server.schema';
import { CreateEventDto } from './dto/create-event.dto';
import { randomBytes } from 'crypto';

const INVITE_EXPIRES_DAYS = 7;
const ONE_TIME_EVENT_DURATION_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class EventsService {
  constructor(
    @InjectModel(ServerEvent.name) private eventModel: Model<ServerEvent>,
    @InjectModel(Server.name) private serverModel: Model<Server>,
  ) {}

  private generateInviteCode(): string {
    return randomBytes(6).toString('base64url');
  }

  async create(
    serverId: string,
    dto: CreateEventDto,
    userId: string,
  ): Promise<ServerEvent> {
    const server = await this.serverModel.findById(serverId);
    if (!server) {
      throw new NotFoundException('Server not found');
    }
    const member = server.members.find(
      (m) => m.userId.toString() === userId,
    );
    if (!member || !['owner', 'moderator'].includes(member.role)) {
      throw new ForbiddenException(
        'Only owner or moderator can create events',
      );
    }

    const startAt = new Date(dto.startAt);
    if (isNaN(startAt.getTime())) {
      throw new BadRequestException('Invalid startAt');
    }

    let endAt: Date;
    if (dto.endAt) {
      endAt = new Date(dto.endAt);
      if (isNaN(endAt.getTime())) {
        throw new BadRequestException('Invalid endAt');
      }
      if (endAt.getTime() <= startAt.getTime()) {
        throw new BadRequestException('endAt must be after startAt');
      }
    } else if (dto.frequency === 'none') {
      endAt = new Date(startAt.getTime() + ONE_TIME_EVENT_DURATION_MS);
    } else {
      endAt = new Date(startAt.getTime() + ONE_TIME_EVENT_DURATION_MS);
    }

    const inviteCode = this.generateInviteCode();
    const inviteExpiresAt = new Date();
    inviteExpiresAt.setDate(inviteExpiresAt.getDate() + INVITE_EXPIRES_DAYS);

    const event = new this.eventModel({
      serverId: new Types.ObjectId(serverId),
      channelId: dto.channelId ? new Types.ObjectId(dto.channelId) : null,
      locationType: dto.locationType,
      topic: dto.topic,
      startAt,
      endAt,
      frequency: dto.frequency,
      description: dto.description || null,
      coverImageUrl: dto.coverImageUrl || null,
      createdBy: new Types.ObjectId(userId),
      inviteCode,
      inviteExpiresAt,
      status: 'scheduled',
    });
    return event.save();
  }

  /** Events that are currently "live" (owner started the event) */
  async getActiveByServer(serverId: string): Promise<ServerEvent[]> {
    const now = new Date();
    return this.eventModel
      .find({
        serverId: new Types.ObjectId(serverId),
        status: 'live',
        endAt: { $gte: now },
      })
      .populate('channelId', 'name type')
      .sort({ startAt: 1 })
      .exec();
  }

  /** Upcoming events (scheduled or no status, startAt > now) */
  async getUpcomingByServer(serverId: string): Promise<ServerEvent[]> {
    const now = new Date();
    return this.eventModel
      .find({
        serverId: new Types.ObjectId(serverId),
        $or: [{ status: 'scheduled' }, { status: { $exists: false } }],
        startAt: { $gt: now },
      })
      .populate('channelId', 'name type')
      .sort({ startAt: 1 })
      .exec();
  }

  /** Start event (owner/moderator can start early) */
  async startEvent(serverId: string, eventId: string, userId: string): Promise<ServerEvent> {
    const server = await this.serverModel.findById(serverId);
    if (!server) throw new NotFoundException('Server not found');
    const member = server.members.find((m) => m.userId.toString() === userId);
    if (!member || !['owner', 'moderator'].includes(member.role)) {
      throw new ForbiddenException('Only owner or moderator can start the event');
    }
    const event = await this.eventModel.findById(eventId).exec();
    if (!event) throw new NotFoundException('Event not found');
    if (event.serverId.toString() !== serverId) throw new NotFoundException('Event not found');
    if (event.status === 'live' || event.status === 'ended') {
      throw new BadRequestException('Event cannot be started');
    }
    event.status = 'live';
    return event.save();
  }

  /** End event (owner/moderator) */
  async endEvent(serverId: string, eventId: string, userId: string): Promise<ServerEvent> {
    const server = await this.serverModel.findById(serverId);
    if (!server) throw new NotFoundException('Server not found');
    const member = server.members.find((m) => m.userId.toString() === userId);
    if (!member || !['owner', 'moderator'].includes(member.role)) {
      throw new ForbiddenException('Only owner or moderator can end the event');
    }
    const event = await this.eventModel.findById(eventId).exec();
    if (!event) throw new NotFoundException('Event not found');
    if (event.serverId.toString() !== serverId) throw new NotFoundException('Event not found');
    if (event.status !== 'live') {
      throw new BadRequestException('Event is not live');
    }
    event.status = 'ended';
    return event.save();
  }

  async getById(eventId: string): Promise<ServerEvent> {
    const event = await this.eventModel
      .findById(eventId)
      .populate('channelId', 'name type')
      .exec();
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }

  getShareLink(event: ServerEvent, baseUrl: string): string {
    if (!event.inviteCode) return '';
    return `${baseUrl}/invite/${event.inviteCode}?event=${event._id}`;
  }

  /** Public event preview by serverId + eventId. Optional userId to know if viewer is member. */
  async getEventPreview(
    serverId: string,
    eventId: string,
    userId?: string,
  ): Promise<{
    event: {
      _id: string;
      topic: string;
      startAt: Date;
      endAt: Date;
      coverImageUrl: string | null;
      description: string | null;
      channelId: { name: string; type: string } | null;
    };
    server: { _id: string; name: string; isPublic: boolean; avatarUrl: string | null };
    isMember: boolean;
  }> {
    const event = await this.eventModel
      .findById(eventId)
      .populate('channelId', 'name type')
      .lean()
      .exec();
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (event.serverId.toString() !== serverId) {
      throw new NotFoundException('Event not found');
    }
    const server = await this.serverModel.findById(serverId).lean().exec();
    if (!server) {
      throw new NotFoundException('Server not found');
    }
    const isMember = userId
      ? server.members.some((m) => m.userId.toString() === userId)
      : false;
    return {
      event: {
        _id: event._id.toString(),
        topic: event.topic,
        startAt: event.startAt,
        endAt: event.endAt,
        coverImageUrl: event.coverImageUrl ?? null,
        description: event.description ?? null,
        channelId: event.channelId
          ? {
              name: (event.channelId as any).name,
              type: (event.channelId as any).type,
            }
          : null,
      },
      server: {
        _id: server._id.toString(),
        name: server.name,
        isPublic: (server as any).isPublic !== false,
        avatarUrl: (server as any).avatarUrl ?? null,
      },
      isMember,
    };
  }
}
