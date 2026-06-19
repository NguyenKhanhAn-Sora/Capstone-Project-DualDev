import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ServerInvite } from './server-invite.schema';
import { ServersService } from '../servers/servers.service';
import { RolesService } from '../roles/roles.service';
import { FollowsService } from '../follows/follows.service';
import { ProfilesService } from '../profiles/profiles.service';
import { ChannelMessagesGateway } from '../messages/channel-messages.gateway';
import {
  AGE_RESTRICTED_JOIN_MESSAGE,
  meetsAgeRequirementForRestrictedServer,
} from '../messages/channel-chat-gate.util';

export interface ServerInviteCandidate {
  _id: string;
  displayName: string;
  username: string;
  avatarUrl: string;
}

@Injectable()
export class ServerInvitesService {
  constructor(
    @InjectModel(ServerInvite.name) private inviteModel: Model<ServerInvite>,
    @Inject(forwardRef(() => ServersService))
    private readonly serversService: ServersService,
    @Inject(forwardRef(() => RolesService))
    private readonly rolesService: RolesService,
    private readonly followsService: FollowsService,
    private readonly profilesService: ProfilesService,
    @Inject(forwardRef(() => ChannelMessagesGateway))
    private readonly channelMessagesGateway: ChannelMessagesGateway,
  ) {}

  private isMemberOf(
    context: { members: { userId: string }[] },
    userId: string,
  ): boolean {
    return context.members.some((m) => m.userId === userId);
  }

  private async assertCanCreateInvite(
    serverId: string,
    fromUserId: string,
    context: { ownerId: string; members: { userId: string }[] },
  ): Promise<void> {
    if (!this.isMemberOf(context, fromUserId)) {
      throw new ForbiddenException('Chỉ thành viên máy chủ mới có thể mời.');
    }
    if (context.ownerId === fromUserId) return;
    const canInvite = await this.rolesService.hasPermission(
      serverId,
      fromUserId,
      'createInvite',
    );
    if (!canInvite) {
      throw new ForbiddenException(
        'Bạn không có quyền tạo lời mời trong máy chủ này.',
      );
    }
  }

  private emitInviteInboxItem(
    invite: ServerInvite,
    context: { name: string; avatarUrl: string | null },
    fromUserId: string,
    toUserId: string,
    inviterDisplay: string,
  ): void {
    try {
      this.channelMessagesGateway.emitInboxForYouItem(
        [toUserId],
        {
          type: 'server_invite',
          _id: invite._id.toString(),
          serverId: invite.serverId.toString(),
          serverName: context.name?.trim?.() ?? '',
          serverAvatarUrl: context.avatarUrl ?? null,
          inviterId: fromUserId,
          inviterDisplay,
          createdAt:
            (invite as any).createdAt?.toISOString?.() ??
            new Date().toISOString(),
          seen: false,
        },
        fromUserId,
      );
    } catch {
      /* non-critical */
    }
  }

  /** Tạo lời mời vào máy chủ (chỉ thành viên có quyền createInvite). */
  async create(
    fromUserId: string,
    toUserId: string,
    serverId: string,
  ): Promise<ServerInvite> {
    const context = await this.serversService.getServerMembershipLean(serverId);
    await this.assertCanCreateInvite(serverId, fromUserId, context);

    if (this.isMemberOf(context, toUserId)) {
      throw new BadRequestException('Người này đã là thành viên máy chủ.');
    }

    const fromId = new Types.ObjectId(fromUserId);
    const toId = new Types.ObjectId(toUserId);
    const serverObjectId = new Types.ObjectId(serverId);

    const existing = await this.inviteModel.findOne({
      fromUserId: fromId,
      toUserId: toId,
      serverId: serverObjectId,
      status: 'pending',
    });
    if (existing) {
      return existing;
    }

    const invite = new this.inviteModel({
      fromUserId: fromId,
      toUserId: toId,
      serverId: serverObjectId,
      status: 'pending',
    });
    const saved = await invite.save();

    const inviterProfile = await this.profilesService.findByUserId(fromUserId);
    const inviterDisplay =
      inviterProfile?.displayName?.trim?.() ||
      inviterProfile?.username?.trim?.() ||
      'Ai đó';
    this.emitInviteInboxItem(
      saved,
      context,
      fromUserId,
      toUserId,
      inviterDisplay,
    );

    return saved;
  }

  /** Follow/followers minus current server members — single optimized call. */
  async getInviteCandidates(
    fromUserId: string,
    serverId: string,
  ): Promise<{
    candidates: ServerInviteCandidate[];
    invitedUserIds: string[];
  }> {
    const userObjectId = new Types.ObjectId(fromUserId);
    const serverObjectId = new Types.ObjectId(serverId);

    const [context, followingIds, followerIds] = await Promise.all([
      this.serversService.getServerMembershipLean(serverId),
      this.followsService.getFollowing(userObjectId),
      this.followsService.getFollowers(userObjectId),
    ]);

    await this.assertCanCreateInvite(serverId, fromUserId, context);

    const memberSet = new Set(context.members.map((m) => m.userId));
    const friendIdSet = new Set<string>();
    for (const raw of [...followingIds, ...followerIds]) {
      const id = raw.toString();
      if (!id || id === fromUserId || memberSet.has(id)) continue;
      friendIdSet.add(id);
    }

    const friendIds = [...friendIdSet];
    const [profiles, pendingInvites] = await Promise.all([
      this.profilesService.findSummariesByUserIds(friendIds),
      friendIds.length
        ? this.inviteModel
            .find({
              fromUserId: userObjectId,
              serverId: serverObjectId,
              status: 'pending',
              toUserId: {
                $in: friendIds.map((id) => new Types.ObjectId(id)),
              },
            })
            .select('toUserId')
            .lean()
            .exec()
        : Promise.resolve([]),
    ]);

    const invitedUserIds = (
      pendingInvites as { toUserId?: Types.ObjectId }[]
    ).map((inv) => inv.toUserId?.toString?.() ?? '').filter(Boolean);

    const candidates: ServerInviteCandidate[] = profiles
      .map((p) => ({
        _id: p.userId,
        displayName: p.displayName,
        username: p.username,
        avatarUrl: p.avatarUrl,
      }))
      .sort((a, b) =>
        a.displayName.localeCompare(b.displayName, undefined, {
          sensitivity: 'base',
        }),
      );

    return { candidates, invitedUserIds };
  }

  /** Lấy danh sách lời mời pending cho user (để hiển thị trong "Dành cho Bạn"). */
  async getPendingForUser(toUserId: string) {
    const toId = new Types.ObjectId(toUserId);
    const list = await this.inviteModel
      .find({ toUserId: toId, status: 'pending' })
      .sort({ createdAt: -1 })
      .populate('fromUserId', 'email')
      .populate('serverId', 'name avatarUrl')
      .lean()
      .exec();
    return list as unknown as ServerInvite[];
  }

  async accept(inviteId: string, userId: string): Promise<void> {
    const invite = await this.inviteModel.findById(inviteId);
    if (!invite) throw new NotFoundException('Lời mời không tồn tại.');
    if (invite.toUserId.toString() !== userId) {
      throw new ForbiddenException('Bạn không thể chấp nhận lời mời này.');
    }
    if (invite.status !== 'pending') {
      throw new BadRequestException('Lời mời đã được xử lý.');
    }

    const serverId = invite.serverId.toString();
    const context = await this.serversService.getServerMembershipLean(serverId);
    if (context.isAgeRestricted) {
      const profile = await this.profilesService.findByUserId(userId);
      const birthdate = (profile as { birthdate?: Date } | null)?.birthdate;
      if (
        !meetsAgeRequirementForRestrictedServer(
          true,
          birthdate ?? null,
        )
      ) {
        throw new ForbiddenException(AGE_RESTRICTED_JOIN_MESSAGE);
      }
    }

    try {
      await this.serversService.addMemberToServer(
        serverId,
        userId,
        'member',
      );
    } catch (e) {
      if (
        e instanceof BadRequestException &&
        (e.message || '').includes('already')
      ) {
        // Already a member — just mark the invite as accepted
      } else {
        throw e;
      }
    }
    invite.status = 'accepted';
    invite.respondedAt = new Date();
    await invite.save();
  }

  /** Chấp nhận lời mời vào máy chủ (tìm pending invite theo serverId + toUserId). */
  async acceptByServer(serverId: string, userId: string): Promise<void> {
    const toId = new Types.ObjectId(userId);
    const serverObjectId = new Types.ObjectId(serverId);
    const invite = await this.inviteModel.findOne({
      serverId: serverObjectId,
      toUserId: toId,
      status: 'pending',
    });
    if (!invite) return;
    await this.accept(invite._id.toString(), userId);
  }

  async decline(inviteId: string, userId: string): Promise<void> {
    const invite = await this.inviteModel.findById(inviteId);
    if (!invite) throw new NotFoundException('Lời mời không tồn tại.');
    if (invite.toUserId.toString() !== userId) {
      throw new ForbiddenException('Bạn không thể từ chối lời mời này.');
    }
    if (invite.status !== 'pending') {
      throw new BadRequestException('Lời mời đã được xử lý.');
    }
    invite.status = 'declined';
    invite.respondedAt = new Date();
    await invite.save();
  }
}
