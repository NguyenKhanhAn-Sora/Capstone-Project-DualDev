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
import { Block } from '../users/block.schema';
import { LivestreamMuteService } from './livestream-mute.service';

const MAX_CONCURRENT_LIVESTREAMS = 5;
const MAX_VIEWERS_PER_ROOM = 30;

@Injectable()
export class LivestreamService {
  private readonly logger = new Logger(LivestreamService.name);

  private readonly DEFAULT_AVATAR_URL =
    process.env.DEFAULT_AVATAR_URL?.trim() ||
    'https://res.cloudinary.com/doicocgeo/image/upload/v1765850274/user-avatar-default_gfx5bs.jpg';

  constructor(
    @InjectModel(Livestream.name)
    private readonly livestreamModel: Model<Livestream>,
    @InjectModel(Profile.name)
    private readonly profileModel: Model<Profile>,
    @InjectModel(Block.name)
    private readonly blockModel: Model<Block>,
    private readonly livekitService: LivekitService,
    private readonly ivsService: IvsService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
    private readonly muteService: LivestreamMuteService,
  ) {}

  private toResponse(
    stream: Livestream,
    viewerCount = 0,
    hostIdentity?: { username?: string; avatarUrl?: string },
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
    hostUsername?: string;
    hostAvatarUrl?: string;
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
      hostUsername: hostIdentity?.username ?? '',
      hostAvatarUrl: hostIdentity?.avatarUrl ?? this.DEFAULT_AVATAR_URL,
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

  private async getHostIdentityMap(
    streams: Livestream[],
  ): Promise<Map<string, { username?: string; avatarUrl?: string }>> {
    const hostIds = Array.from(
      new Set(
        streams
          .map((stream) => stream.hostUserId?.toString?.() ?? '')
          .filter((id) => Boolean(id) && Types.ObjectId.isValid(id)),
      ),
    );

    if (!hostIds.length) {
      return new Map<string, { username?: string; avatarUrl?: string }>();
    }

    const profiles = await this.profileModel
      .find({ userId: { $in: hostIds.map((id) => new Types.ObjectId(id)) } })
      .select('userId username avatarUrl')
      .lean();

    const out = new Map<string, { username?: string; avatarUrl?: string }>();
    for (const profile of profiles) {
      const userId = profile.userId?.toString?.();
      if (!userId) continue;
      out.set(userId, {
        username: profile.username ?? '',
        avatarUrl: profile.avatarUrl || this.DEFAULT_AVATAR_URL,
      });
    }
    return out;
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

  private async getStreamAnyStatusOrThrow(
    streamId: string,
  ): Promise<Livestream> {
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

    const [participantCounts, hostIdentityMap] = await Promise.all([
      Promise.all(
        streams.map((stream) =>
          this.livekitService.getParticipantCount(stream.roomName),
        ),
      ),
      this.getHostIdentityMap(streams),
    ]);

    return {
      maxConcurrentLivestreams: MAX_CONCURRENT_LIVESTREAMS,
      maxViewersPerRoom: MAX_VIEWERS_PER_ROOM,
      activeCount: streams.length,
      items: streams.map((stream, i) => {
        const hostId = stream.hostUserId?.toString?.() ?? '';
        const hostIdentity = hostIdentityMap.get(hostId);
        return this.toResponse(stream, participantCounts[i], hostIdentity);
      }),
    };
  }

  async create(userId: string, dto: CreateLivestreamDto) {
    const title = dto.title.trim();
    const titleWordCount = title
      ? title.split(/\s+/).filter(Boolean).length
      : 0;
    if (titleWordCount > 300) {
      throw new BadRequestException(
        'Livestream title supports up to 300 words',
      );
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
      stream: this.toResponse(stream, 1, {
        username: hostProfile?.username ?? '',
        avatarUrl: this.DEFAULT_AVATAR_URL,
      }),
      limits: {
        maxConcurrentLivestreams: MAX_CONCURRENT_LIVESTREAMS,
        maxViewersPerRoom: MAX_VIEWERS_PER_ROOM,
      },
    };
  }

  async joinToken(
    streamId: string,
    user: { userId: string },
    opts: { asHost?: boolean; participantName?: string; isPreview?: boolean },
  ) {
    const stream = await this.getLiveStreamOrThrow(streamId);
    const asHost = Boolean(opts.asHost);
    const isPreview = Boolean(opts.isPreview);
    const isHost = stream.hostUserId.toString() === user.userId;

    if (asHost && !isHost) {
      throw new ForbiddenException('Only the host can publish this livestream');
    }

    // Block check: if host has blocked this viewer, deny entry.
    if (!isHost) {
      const isBlocked = await this.blockModel.exists({
        blockerId: new Types.ObjectId(stream.hostUserId.toString()),
        blockedId: new Types.ObjectId(user.userId),
      });
      if (isBlocked) {
        throw new ForbiddenException('BLOCKED_BY_HOST');
      }
    }

    const participants = await this.livekitService.getParticipantCount(
      stream.roomName,
    );

    if (!asHost && !isPreview && participants >= MAX_VIEWERS_PER_ROOM + 1) {
      throw new BadRequestException(
        'This livestream has reached the 30-viewer limit',
      );
    }

    const role = asHost ? 'host' : 'viewer';
    const identity = isPreview
      ? `preview-${user.userId}-${Date.now().toString(36)}`
      : `${user.userId}-${role}-${Date.now().toString(36)}`;
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

    const hostProfile = await this.profileModel
      .findOne({ userId: stream.hostUserId })
      .select('username avatarUrl')
      .lean();

    // Mute check: viewer may be paused from commenting in this host's live.
    let commentPaused = false;
    let commentPausedUntil: string | null = null;
    if (!isHost && !isPreview) {
      const muteStatus = await this.muteService.isMuted(
        stream.hostUserId.toString(),
        user.userId,
      );
      if (muteStatus.muted && muteStatus.expiresAt) {
        commentPaused = true;
        commentPausedUntil = muteStatus.expiresAt.toISOString();
      }
    }

    return {
      token,
      url: this.livekitService.getPublicUrl(),
      stream: this.toResponse(stream, participants, {
        username: hostProfile?.username ?? '',
        avatarUrl: hostProfile?.avatarUrl || this.DEFAULT_AVATAR_URL,
      }),
      role,
      commentPaused,
      commentPausedUntil,
    };
  }

  async muteUser(
    hostId: string,
    userId: string,
    durationMinutes: number,
  ): Promise<{ expiresAt: string }> {
    const result = await this.muteService.mute(hostId, userId, durationMinutes);
    return { expiresAt: result.expiresAt.toISOString() };
  }

  async getById(streamId: string) {
    const stream = await this.getStreamAnyStatusOrThrow(streamId);
    const participants =
      stream.status === 'live'
        ? await this.livekitService.getParticipantCount(stream.roomName)
        : 0;
    const hostProfile = await this.profileModel
      .findOne({ userId: stream.hostUserId })
      .select('username avatarUrl')
      .lean();
    return {
      stream: this.toResponse(stream, participants, {
        username: hostProfile?.username ?? '',
        avatarUrl: hostProfile?.avatarUrl || this.DEFAULT_AVATAR_URL,
      }),
    };
  }

  async getIvsIngest(streamId: string, userId: string) {
    const stream = await this.getLiveStreamOrThrow(streamId);
    if (stream.hostUserId.toString() !== userId) {
      throw new ForbiddenException(
        'Only the host can access IVS ingest credentials',
      );
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
        throw new BadRequestException(
          'Livestream title supports up to 300 words',
        );
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

    const participants = await this.livekitService.getParticipantCount(
      stream.roomName,
    );
    const hostProfile = await this.profileModel
      .findOne({ userId: stream.hostUserId })
      .select('username avatarUrl')
      .lean();
    return {
      stream: this.toResponse(stream, participants, {
        username: hostProfile?.username ?? '',
        avatarUrl: hostProfile?.avatarUrl || this.DEFAULT_AVATAR_URL,
      }),
    };
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
