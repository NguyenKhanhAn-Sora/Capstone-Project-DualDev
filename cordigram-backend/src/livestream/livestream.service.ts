import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Livestream } from './livestream.schema';
import { LivekitService } from '../livekit/livekit.service';
import { CreateLivestreamDto } from './dto/create-livestream.dto';
import { UpdateLivestreamDto } from './dto/update-livestream.dto';
import { Profile } from '../profiles/profile.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { ConfigService } from '../config/config.service';
import { IvsService } from './ivs.service';

const MAX_CONCURRENT_LIVESTREAMS = 5;
const MAX_VIEWERS_PER_ROOM = 30;

@Injectable()
export class LivestreamService {
  private readonly logger = new Logger(LivestreamService.name);

  constructor(
    @InjectModel(Livestream.name)
    private readonly livestreamModel: Model<Livestream>,
    @InjectModel(Profile.name)
    private readonly profileModel: Model<Profile>,
    private readonly livekitService: LivekitService,
    private readonly ivsService: IvsService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {}

  private toResponse(
    stream: Livestream,
    viewerCount = 0,
  ): {
    id: string;
    title: string;
    description: string;
    pinnedComment: string;
    location: string;
    mentionUsernames: string[];
    visibility: 'public' | 'followers' | 'private';
    latencyMode: 'adaptive' | 'balanced' | 'low';
    hostName: string;
    hostUserId: string;
    roomName: string;
    provider: 'livekit' | 'ivs';
    ivsPlaybackUrl?: string;
    status: 'live' | 'ended';
    startedAt: Date;
    endedAt: Date | null;
    maxViewers: number;
    viewerCount: number;
  } {
    return {
      id: stream._id.toString(),
      title: stream.title,
      description: stream.description,
      pinnedComment: stream.pinnedComment,
      location: stream.location,
      mentionUsernames: stream.mentionUsernames ?? [],
      visibility: stream.visibility,
      latencyMode: stream.latencyMode ?? 'adaptive',
      hostName: stream.hostName,
      hostUserId: stream.hostUserId.toString(),
      roomName: stream.roomName,
      provider: stream.provider ?? 'livekit',
      ivsPlaybackUrl: stream.ivsPlaybackUrl || '',
      status: stream.status,
      startedAt: stream.startedAt,
      endedAt: stream.endedAt,
      maxViewers: stream.maxViewers,
      viewerCount,
    };
  }

  private async countLiveRooms(): Promise<number> {
    return this.livestreamModel.countDocuments({ status: 'live' }).exec();
  }

  private normalizeMentions(raw: unknown, title: string): string[] {
    const set = new Set<string>();

    if (Array.isArray(raw)) {
      raw.forEach((item) => {
        if (typeof item === 'string') {
          const normalized = item.trim().replace(/^@/, '').toLowerCase();
          if (/^[a-z0-9_.]{1,30}$/i.test(normalized)) {
            set.add(normalized);
          }
        }
      });
    }

    const regex = /@([a-zA-Z0-9_.]{1,30})/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(title))) {
      set.add(match[1].toLowerCase());
    }

    return Array.from(set).slice(0, 20);
  }

  private async notifyMentionedUsers(params: {
    actorId: string;
    title: string;
    streamId: string;
    usernames: string[];
  }): Promise<void> {
    if (!params.usernames.length) return;

    const profiles = await this.profileModel
      .find({ username: { $in: params.usernames } })
      .select('userId username')
      .lean();

    const actorIdStr = params.actorId.toString();
    const recipientIds = profiles
      .map((p) => p.userId?.toString?.())
      .filter((id): id is string => Boolean(id) && id !== actorIdStr);

    if (!recipientIds.length) return;

    const actionUrl = `${this.configService.frontendUrl}/?liveStreamId=${encodeURIComponent(
      params.streamId,
    )}`;

    await Promise.all(
      Array.from(new Set(recipientIds)).map((recipientId) =>
        this.notificationsService.createSystemNoticeNotification({
          recipientId,
          title: 'You were mentioned in a livestream title',
          body: `You were tagged in "${params.title}".`,
          level: 'info',
          actionUrl,
        }),
      ),
    );
  }

  private async getLiveStreamOrThrow(streamId: string): Promise<Livestream> {
    if (!Types.ObjectId.isValid(streamId)) {
      throw new NotFoundException('Livestream not found');
    }
    const stream = await this.livestreamModel.findById(streamId).exec();
    if (!stream || stream.status !== 'live') {
      throw new NotFoundException('Livestream does not exist or has ended');
    }
    return stream;
  }

  private async getStreamAnyStatusOrThrow(streamId: string): Promise<Livestream> {
    if (!Types.ObjectId.isValid(streamId)) {
      throw new NotFoundException('Livestream not found');
    }
    const stream = await this.livestreamModel.findById(streamId).exec();
    if (!stream) {
      throw new NotFoundException('Livestream not found');
    }
    return stream;
  }

  async listLive() {
    const streams = await this.livestreamModel
      .find({ status: 'live' })
      .sort({ startedAt: -1 })
      .limit(MAX_CONCURRENT_LIVESTREAMS)
      .exec();

    const rooms = await this.livekitService.listRoomsByPrefix('live-');
    const roomParticipantMap = new Map<string, number>();
    rooms.forEach((room) => {
      roomParticipantMap.set(room.name, room.numParticipants ?? 0);
    });

    return {
      maxConcurrentLivestreams: MAX_CONCURRENT_LIVESTREAMS,
      maxViewersPerRoom: MAX_VIEWERS_PER_ROOM,
      activeCount: streams.length,
      items: streams.map((stream) =>
        this.toResponse(stream, roomParticipantMap.get(stream.roomName) ?? 0),
      ),
    };
  }

  async create(userId: string, dto: CreateLivestreamDto) {
    const title = dto.title.trim();
    const titleWordCount = title ? title.split(/\s+/).filter(Boolean).length : 0;
    if (titleWordCount > 300) {
      throw new BadRequestException('Livestream title supports up to 300 words');
    }

    const activeByHost = await this.livestreamModel
      .findOne({ hostUserId: new Types.ObjectId(userId), status: 'live' })
      .exec();
    if (activeByHost) {
      throw new BadRequestException('You already have an active livestream');
    }

    const activeCount = await this.countLiveRooms();
    if (activeCount >= MAX_CONCURRENT_LIVESTREAMS) {
      throw new BadRequestException(
        `System allows only ${MAX_CONCURRENT_LIVESTREAMS} concurrent livestreams`,
      );
    }

    const roomName = `live-${userId}-${Date.now().toString(36)}`;
    const hostProfile = await this.profileModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .select('displayName username')
      .lean();

    const hostName =
      hostProfile?.displayName || hostProfile?.username || 'Host';

    const mentionUsernames = this.normalizeMentions(dto.mentions, dto.title);

    let provider: 'livekit' | 'ivs' = 'livekit';
    let ivsChannelArn = '';
    let ivsPlaybackUrl = '';
    let ivsIngestEndpoint = '';
    let ivsStreamKey = '';

    if (this.ivsService.enabled) {
      try {
        const ivs = await this.ivsService.createChannelForStream({
          streamId: `${userId}-${Date.now().toString(36)}`,
          latencyMode: dto.latencyMode ?? 'adaptive',
        });
        provider = 'ivs';
        ivsChannelArn = ivs.channelArn;
        ivsPlaybackUrl = ivs.playbackUrl;
        ivsIngestEndpoint = ivs.ingestEndpoint;
        ivsStreamKey = ivs.streamKey;
      } catch (err) {
        this.logger.warn(
          `IVS provisioning failed, fallback to livekit. reason=${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    const stream = await this.livestreamModel.create({
      hostUserId: new Types.ObjectId(userId),
      hostName,
      title,
      description: (dto.description ?? '').trim(),
      pinnedComment: (dto.pinnedComment ?? '').trim(),
      location: (dto.location ?? '').trim(),
      mentionUsernames,
      visibility: dto.visibility ?? 'public',
      latencyMode: dto.latencyMode ?? 'adaptive',
      roomName,
      provider,
      ivsChannelArn,
      ivsPlaybackUrl,
      ivsIngestEndpoint,
      ivsStreamKey,
      maxViewers: MAX_VIEWERS_PER_ROOM,
      status: 'live',
      startedAt: new Date(),
      endedAt: null,
    });

    await this.notifyMentionedUsers({
      actorId: userId,
      title,
      streamId: stream._id.toString(),
      usernames: mentionUsernames,
    });

    return {
      stream: this.toResponse(stream, 1),
      limits: {
        maxConcurrentLivestreams: MAX_CONCURRENT_LIVESTREAMS,
        maxViewersPerRoom: MAX_VIEWERS_PER_ROOM,
      },
    };
  }

  async joinToken(
    streamId: string,
    user: { userId: string },
    opts: { asHost?: boolean; participantName?: string },
  ) {
    const stream = await this.getLiveStreamOrThrow(streamId);
    const asHost = Boolean(opts.asHost);
    const isHost = stream.hostUserId.toString() === user.userId;

    if (asHost && !isHost) {
      throw new ForbiddenException('Only the host can publish this livestream');
    }

    const participants = await this.livekitService.getParticipantCount(
      stream.roomName,
    );

    if (!asHost && participants >= MAX_VIEWERS_PER_ROOM + 1) {
      throw new BadRequestException('This livestream has reached the 30-viewer limit');
    }

    const role = asHost ? 'host' : 'viewer';
    const identity = `${user.userId}-${role}-${Date.now().toString(36)}`;
    const participantName =
      opts.participantName?.trim() || (asHost ? stream.hostName : 'Viewer');

    const token = await this.livekitService.generateTokenWithPermissions({
      roomName: stream.roomName,
      participantName,
      participantId: identity,
      // canPublish must be true for all participants so the LiveKit client
      // establishes a publisher PeerConnection (required for publishData /
      // data-channel comments). The actual media publishing is prevented on
      // the frontend by the LiveKitRoom audio={false} video={false} props and
      // the absence of any publishTrack() call in the viewer UI.
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    this.logger.log(
      `joinToken issued stream=${streamId} role=${role} user=${user.userId} identity=${identity} canPublish=true canSubscribe=true canPublishData=true participants=${participants}`,
    );

    return {
      token,
      url: this.livekitService.getPublicUrl(),
      stream: this.toResponse(stream, participants),
      role,
    };
  }

  async getById(streamId: string) {
    const stream = await this.getStreamAnyStatusOrThrow(streamId);
    const participants =
      stream.status === 'live'
        ? await this.livekitService.getParticipantCount(stream.roomName)
        : 0;
    return { stream: this.toResponse(stream, participants) };
  }

  async getIvsIngest(streamId: string, userId: string) {
    const stream = await this.getLiveStreamOrThrow(streamId);
    if (stream.hostUserId.toString() !== userId) {
      throw new ForbiddenException('Only the host can access IVS ingest credentials');
    }

    if ((stream.provider ?? 'livekit') !== 'ivs') {
      throw new BadRequestException('This livestream is not using AWS IVS');
    }

    return {
      provider: 'ivs',
      ingestEndpoint: stream.ivsIngestEndpoint || '',
      streamKey: stream.ivsStreamKey || '',
      playbackUrl: stream.ivsPlaybackUrl || '',
    };
  }

  async updateLiveSettings(
    streamId: string,
    userId: string,
    dto: UpdateLivestreamDto,
  ) {
    const stream = await this.getLiveStreamOrThrow(streamId);
    if (stream.hostUserId.toString() !== userId) {
      throw new ForbiddenException('Only the host can update this livestream');
    }

    if (typeof dto.title === 'string') {
      const title = dto.title.trim();
      if (!title) {
        throw new BadRequestException('Livestream title cannot be empty');
      }
      const titleWordCount = title.split(/\s+/).filter(Boolean).length;
      if (titleWordCount > 300) {
        throw new BadRequestException('Livestream title supports up to 300 words');
      }
      stream.title = title;
      stream.mentionUsernames = this.normalizeMentions(undefined, title);
    }

    if (typeof dto.description === 'string') {
      stream.description = dto.description.trim();
    }

    if (typeof dto.pinnedComment === 'string') {
      stream.pinnedComment = dto.pinnedComment.trim();
    }

    if (typeof dto.location === 'string') {
      stream.location = dto.location.trim();
    }

    if (typeof dto.latencyMode === 'string') {
      stream.latencyMode = dto.latencyMode;
    }

    await stream.save();

    const participants = await this.livekitService.getParticipantCount(stream.roomName);
    return { stream: this.toResponse(stream, participants) };
  }

  async end(streamId: string, userId: string) {
    const stream = await this.getLiveStreamOrThrow(streamId);
    if (stream.hostUserId.toString() !== userId) {
      throw new ForbiddenException('Only the host can end this livestream');
    }

    stream.status = 'ended';
    stream.endedAt = new Date();
    await stream.save();

    if ((stream.provider ?? 'livekit') === 'ivs') {
      await this.ivsService.deleteChannelSafe(stream.ivsChannelArn);
    }

    await this.livekitService.deleteRoomSafe(stream.roomName);

    return { ok: true };
  }
}
