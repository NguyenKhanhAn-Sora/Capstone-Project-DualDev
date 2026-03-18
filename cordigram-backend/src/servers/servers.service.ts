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
import { Server } from './server.schema';
import { Channel } from '../channels/channel.schema';
import { CreateServerDto } from './dto/create-server.dto';
import { UpdateServerDto } from './dto/update-server.dto';
import { User } from '../users/user.schema';
import { Profile } from '../profiles/profile.schema';
import { ServerInvite } from '../server-invites/server-invite.schema';
import { RolesService } from '../roles/roles.service';

@Injectable()
export class ServersService {
  constructor(
    @InjectModel(Server.name) private serverModel: Model<Server>,
    @InjectModel(Channel.name) private channelModel: Model<Channel>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Profile.name) private profileModel: Model<Profile>,
    @InjectModel(ServerInvite.name) private serverInviteModel: Model<ServerInvite>,
    @Inject(forwardRef(() => RolesService))
    private rolesService: RolesService,
  ) {}

  /**
   * Prune (bulk kick) members who are inactive for N days.
   *
   * "Last active" is derived from the latest login device `lastSeenAt` (if present).
   * If a user has no loginDevices tracked yet, we fall back to `createdAt`.
   *
   * Notes:
   * - Owner is never pruned.
   * - `roleFilter` matches the server member role (owner/moderator/member).
   */
  private async resolvePrunableMemberIds(params: {
    serverId: string;
    requesterUserId: string;
    days: number;
    roleFilter?: 'moderator' | 'member' | 'none' | 'all';
  }): Promise<string[]> {
    const { serverId, requesterUserId, days, roleFilter } = params;
    const server = await this.serverModel.findById(serverId).exec();
    if (!server) throw new NotFoundException(`Server with id ${serverId} not found`);
    if (server.ownerId.toString() !== requesterUserId) {
      throw new ForbiddenException('Chỉ chủ máy chủ mới có thể lược bỏ thành viên');
    }
    if (!Number.isFinite(days) || days <= 0) {
      throw new BadRequestException('days must be a positive number');
    }

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const normalizedRole = roleFilter ?? 'all';

    const members = server.members.filter((m) => {
      const uid = m.userId.toString();
      if (uid === server.ownerId.toString()) return false; // never prune owner
      if (normalizedRole === 'all') return true;
      if (normalizedRole === 'none') return m.role === 'member';
      return m.role === normalizedRole;
    });

    if (members.length === 0) return [];

    const userIds = members.map((m) => m.userId);
    const users = await this.userModel
      .find({ _id: { $in: userIds } })
      .select('_id createdAt loginDevices')
      .lean()
      .exec();

    const prunable: string[] = [];
    for (const u of users as any[]) {
      const deviceLastSeen: Date | null =
        Array.isArray(u.loginDevices) && u.loginDevices.length > 0
          ? u.loginDevices
              .map((d: any) => (d?.lastSeenAt ? new Date(d.lastSeenAt) : null))
              .filter(Boolean)
              .sort((a: Date, b: Date) => b.getTime() - a.getTime())[0] ?? null
          : null;
      const lastActive = deviceLastSeen ?? (u.createdAt ? new Date(u.createdAt) : new Date(0));
      if (lastActive < cutoff) {
        prunable.push(u._id.toString());
      }
    }
    return prunable;
  }

  /** Preview count for prune members. */
  async getPruneCount(params: {
    serverId: string;
    requesterUserId: string;
    days: number;
    roleFilter?: 'moderator' | 'member' | 'none' | 'all';
  }): Promise<number> {
    const ids = await this.resolvePrunableMemberIds(params);
    return ids.length;
  }

  /** Execute prune members (bulk kick). Returns number of removed members. */
  async pruneMembers(params: {
    serverId: string;
    requesterUserId: string;
    days: number;
    roleFilter?: 'moderator' | 'member' | 'none' | 'all';
  }): Promise<number> {
    const { serverId, requesterUserId } = params;
    const ids = await this.resolvePrunableMemberIds(params);
    if (ids.length === 0) return 0;

    const server = await this.serverModel.findById(serverId).exec();
    if (!server) throw new NotFoundException(`Server with id ${serverId} not found`);
    if (server.ownerId.toString() !== requesterUserId) {
      throw new ForbiddenException('Chỉ chủ máy chủ mới có thể lược bỏ thành viên');
    }

    const removeSet = new Set(ids);
    server.members = server.members.filter((m) => !removeSet.has(m.userId.toString()));
    server.memberCount = server.members.length;
    await server.save();
    return ids.length;
  }

  async createServer(
    createServerDto: CreateServerDto,
    userId: string,
  ): Promise<Server> {
    const userObjectId = new Types.ObjectId(userId);

    // Create server
    const server = new this.serverModel({
      name: createServerDto.name,
      description: createServerDto.description || null,
      avatarUrl: createServerDto.avatarUrl || null,
      template: createServerDto.template || 'custom',
      purpose: createServerDto.purpose || 'me-and-friends',
      ownerId: userObjectId,
      members: [
        {
          userId: userObjectId,
          role: 'owner',
          joinedAt: new Date(),
        },
      ],
      memberCount: 1,
      isPublic: true,
    });

    const savedServer = await server.save();

    // Create default text channel "general"
    const textChannel = new this.channelModel({
      name: 'general',
      type: 'text',
      description: 'General chat channel',
      serverId: savedServer._id,
      createdBy: userObjectId,
      isDefault: true,
    });

    const savedTextChannel = await textChannel.save();

    // Create default voice channel "general"
    const voiceChannel = new this.channelModel({
      name: 'general',
      type: 'voice',
      description: 'General voice channel',
      serverId: savedServer._id,
      createdBy: userObjectId,
      isDefault: true,
    });

    const savedVoiceChannel = await voiceChannel.save();

    // Update server with channels
    savedServer.channels = [savedTextChannel._id, savedVoiceChannel._id];
    await savedServer.save();

    // Create default @everyone role for the server
    await this.rolesService.createDefaultRole(savedServer._id.toString());

    return savedServer;
  }

  async getServersByUserId(userId: string): Promise<Server[]> {
    const userObjectId = new Types.ObjectId(userId);
    return this.serverModel
      .find({ 'members.userId': userObjectId })
      .populate('channels')
      .exec();
  }

  async getServerById(serverId: string): Promise<Server> {
    const server = await this.serverModel
      .findById(serverId)
      .populate({
        path: 'channels',
        populate: [{ path: 'createdBy', select: 'email' }],
      })
      .exec();

    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    return server;
  }

  async updateServer(
    serverId: string,
    updateServerDto: UpdateServerDto,
    userId: string,
  ): Promise<Server> {
    const server = await this.serverModel.findById(serverId);

    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    // Check if user is owner
    const isOwner = server.ownerId.toString() === userId;
    if (!isOwner) {
      throw new ForbiddenException(
        'Only server owner can update server details',
      );
    }

    if (updateServerDto.name) server.name = updateServerDto.name;
    if (updateServerDto.description !== undefined)
      server.description = updateServerDto.description;
    if (updateServerDto.avatarUrl !== undefined)
      server.avatarUrl = updateServerDto.avatarUrl;
    if (updateServerDto.isPublic !== undefined)
      server.isPublic = updateServerDto.isPublic;

    return server.save();
  }

  async deleteServer(serverId: string, userId: string): Promise<void> {
    const server = await this.serverModel.findById(serverId);

    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    // Check if user is owner
    if (server.ownerId.toString() !== userId) {
      throw new ForbiddenException('Only server owner can delete the server');
    }

    // Delete all channels in server
    await this.channelModel.deleteMany({ serverId });

    // Delete all roles in server
    await this.rolesService.deleteRolesByServer(serverId);

    // Delete server
    await this.serverModel.findByIdAndDelete(serverId);
  }

  async addMemberToServer(
    serverId: string,
    memberId: string,
    role: 'moderator' | 'member' = 'member',
  ): Promise<Server> {
    const server = await this.serverModel.findById(serverId);

    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    const memberObjectId = new Types.ObjectId(memberId);

    // Check if member already exists
    const memberExists = server.members.some(
      (m) => m.userId.toString() === memberId,
    );

    if (memberExists) {
      throw new BadRequestException('Member already in server');
    }

    server.members.push({
      userId: memberObjectId,
      role,
      joinedAt: new Date(),
    });

    server.memberCount = server.members.length;

    return server.save();
  }

  /** Join a public server (used from event link). Fails if server is private. */
  async joinServer(serverId: string, userId: string): Promise<Server> {
    const server = await this.serverModel.findById(serverId);

    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    if (!server.isPublic) {
      throw new ForbiddenException('You do not have access to this server');
    }

    return this.addMemberToServer(serverId, userId, 'member');
  }

  isMember(server: Server, userId: string): boolean {
    return server.members.some((m) => m.userId.toString() === userId);
  }

  async removeMemberFromServer(
    serverId: string,
    memberId: string,
    userId: string,
  ): Promise<Server> {
    const server = await this.serverModel.findById(serverId);

    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    // Only owner can remove members
    if (server.ownerId.toString() !== userId) {
      throw new ForbiddenException('Only server owner can remove members');
    }

    server.members = server.members.filter(
      (m) => m.userId.toString() !== memberId,
    );

    server.memberCount = server.members.length;

    return server.save();
  }

  /** Thành viên (không phải chủ) rời máy chủ. Chủ không thể rời. */
  async leaveServer(serverId: string, userId: string): Promise<void> {
    const server = await this.serverModel.findById(serverId);

    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    if (server.ownerId.toString() === userId) {
      throw new ForbiddenException('Chủ máy chủ không thể rời. Hãy chuyển quyền hoặc xóa máy chủ.');
    }

    const wasMember = server.members.some((m) => m.userId.toString() === userId);
    if (!wasMember) {
      return;
    }

    server.members = server.members.filter(
      (m) => m.userId.toString() !== userId,
    );
    server.memberCount = server.members.length;
    await server.save();
  }

  /** Danh sách thành viên máy chủ (chỉ chủ server). Trả về: tên, avatar, gia nhập server từ, đã tham gia Cordigram, cách gia nhập (link / mời bởi). */
  async getServerMembers(
    serverId: string,
    requesterUserId: string,
  ): Promise<
    Array<{
      userId: string;
      displayName: string;
      username: string;
      avatarUrl: string;
      joinedAt: Date;
      joinedCordigramAt: Date;
      joinMethod: 'owner' | 'invited' | 'link';
      invitedBy?: { id: string; username: string };
      role: string;
    }>
  > {
    const server = await this.serverModel.findById(serverId).exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }
    if (server.ownerId.toString() !== requesterUserId) {
      throw new ForbiddenException(
        'Chỉ chủ máy chủ mới có thể xem danh sách thành viên',
      );
    }

    const memberIds = server.members.map((m) => m.userId.toString());
    const userIds = server.members.map((m) => m.userId);
    const users = await this.userModel
      .find({ _id: { $in: userIds } })
      .select('_id createdAt')
      .lean()
      .exec();
    const userMap = new Map(
      users.map((u) => [
        u._id.toString(),
        u as unknown as { _id: Types.ObjectId; createdAt: Date },
      ]),
    );

    const profiles = await this.profileModel
      .find({ userId: { $in: userIds } })
      .select('userId displayName username avatarUrl')
      .lean()
      .exec();
    const profileByUserId = new Map(
      profiles.map((p: any) => [p.userId.toString(), p]),
    );

    const serverObjectId = new Types.ObjectId(serverId);
    const acceptedInvites = await this.serverInviteModel
      .find({
        serverId: serverObjectId,
        status: 'accepted',
        toUserId: { $in: userIds },
      })
      .populate('fromUserId', '_id')
      .lean()
      .exec();
    const inviteByToId = new Map<
      string,
      { fromUserId: string; fromUsername?: string }
    >();
    const inviterIds = [
      ...new Set(
        (acceptedInvites as any[]).map((inv) => {
          const from = inv.fromUserId;
          return (from?._id ?? from)?.toString();
        }),
      ),
    ].filter(Boolean);
    if (inviterIds.length > 0) {
      const inviterProfiles = await this.profileModel
        .find({ userId: { $in: inviterIds.map((id) => new Types.ObjectId(id)) } })
        .select('userId username')
        .lean()
        .exec();
      const inviterMap = new Map(
        (inviterProfiles as any[]).map((p) => [p.userId.toString(), p.username]),
      );
      for (const inv of acceptedInvites as any[]) {
        const toId = (inv.toUserId?._id ?? inv.toUserId)?.toString();
        const fromId = (inv.fromUserId?._id ?? inv.fromUserId)?.toString();
        if (toId && fromId) {
          inviteByToId.set(toId, {
            fromUserId: fromId,
            fromUsername: inviterMap.get(fromId),
          });
        }
      }
    }

    const result: Array<{
      userId: string;
      displayName: string;
      username: string;
      avatarUrl: string;
      joinedAt: Date;
      joinedCordigramAt: Date;
      joinMethod: 'owner' | 'invited' | 'link';
      invitedBy?: { id: string; username: string };
      role: string;
    }> = [];

    for (const m of server.members) {
      const uid = m.userId.toString();
      const profile = profileByUserId.get(uid) as
        | { displayName: string; username: string; avatarUrl: string }
        | undefined;
      const user = userMap.get(uid);
      const joinedCordigramAt = user?.createdAt
        ? new Date(user.createdAt)
        : m.joinedAt;
      const joinedAt = m.joinedAt instanceof Date ? m.joinedAt : new Date(m.joinedAt);
      const isOwner = server.ownerId.toString() === uid;
      const invite = inviteByToId.get(uid);

      let joinMethod: 'owner' | 'invited' | 'link' = 'link';
      let invitedBy: { id: string; username: string } | undefined;
      if (isOwner) {
        joinMethod = 'owner';
      } else if (invite) {
        joinMethod = 'invited';
        invitedBy = {
          id: invite.fromUserId,
          username: invite.fromUsername ?? 'Người dùng',
        };
      }

      result.push({
        userId: uid,
        displayName: profile?.displayName ?? 'Người dùng',
        username: profile?.username ?? uid,
        avatarUrl: profile?.avatarUrl ?? '',
        joinedAt,
        joinedCordigramAt,
        joinMethod,
        invitedBy,
        role: m.role,
      });
    }

    return result;
  }

  // =====================================================
  // USER PERMISSIONS
  // =====================================================

  /**
   * Lấy permissions của user hiện tại trong server
   * Trả về các quyền dựa trên roles của user
   */
  async getCurrentUserPermissions(
    serverId: string,
    userId: string,
  ): Promise<{
    isOwner: boolean;
    hasCustomRole: boolean; // User có vai trò nào ngoài @everyone không
    canKick: boolean;
    canBan: boolean;
    canTimeout: boolean;
    canManageServer: boolean;
    canManageChannels: boolean;
    canManageEvents: boolean;
    canCreateInvite: boolean;
  }> {
    const server = await this.serverModel.findById(serverId).exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    // Kiểm tra có phải member không
    const isMember = server.members.some(
      (m) => m.userId.toString() === userId,
    );
    if (!isMember) {
      throw new ForbiddenException('Bạn không phải thành viên của server này');
    }

    const isOwner = server.ownerId.toString() === userId;

    // Kiểm tra user có vai trò nào ngoài @everyone không
    const memberRoles = await this.rolesService.getMemberRoles(serverId, userId);
    const hasCustomRole = memberRoles.some((r) => !r.isDefault);

    // Owner có tất cả quyền
    if (isOwner) {
      return {
        isOwner: true,
        hasCustomRole: true, // Owner luôn có quyền
        canKick: true,
        canBan: true,
        canTimeout: true,
        canManageServer: true,
        canManageChannels: true,
        canManageEvents: true,
        canCreateInvite: true,
      };
    }

    // Lấy permissions từ roles
    const permissions = await this.rolesService.calculateMemberPermissions(
      serverId,
      userId,
    );

    return {
      isOwner: false,
      hasCustomRole,
      canKick: permissions.kickMembers,
      canBan: permissions.banMembers,
      canTimeout: permissions.timeoutMembers,
      canManageServer: permissions.manageServer,
      canManageChannels: permissions.manageChannels,
      canManageEvents: permissions.manageEvents,
      canCreateInvite: permissions.createInvite,
    };
  }

  // =====================================================
  // PUBLIC MEMBER LIST WITH ROLE INFO
  // =====================================================

  /**
   * Lấy danh sách thành viên với thông tin role (PUBLIC - cho tất cả members)
   * Trả về: thông tin cơ bản + roles + màu hiển thị + quyền của user hiện tại
   */
  async getServerMembersWithRoles(
    serverId: string,
    requesterUserId: string,
  ): Promise<{
    members: Array<{
      userId: string;
      displayName: string;
      username: string;
      avatarUrl: string;
      joinedAt: Date;
      isOwner: boolean;
      roles: Array<{ _id: string; name: string; color: string; position: number }>;
      highestRolePosition: number;
      displayColor: string;
    }>;
    currentUserPermissions: {
      canKick: boolean;
      canBan: boolean;
      canTimeout: boolean;
      isOwner: boolean;
    };
  }> {
    const server = await this.serverModel.findById(serverId).exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    // Kiểm tra người yêu cầu có phải member không
    const isMember = server.members.some(
      (m) => m.userId.toString() === requesterUserId,
    );
    if (!isMember) {
      throw new ForbiddenException('Bạn không phải thành viên của server này');
    }

    const userIds = server.members.map((m) => m.userId);

    // Lấy profiles
    const profiles = await this.profileModel
      .find({ userId: { $in: userIds } })
      .select('userId displayName username avatarUrl')
      .lean()
      .exec();
    const profileByUserId = new Map(
      profiles.map((p: any) => [p.userId.toString(), p]),
    );

    // Lấy thông tin role cho từng member
    const membersResult: Array<{
      userId: string;
      displayName: string;
      username: string;
      avatarUrl: string;
      joinedAt: Date;
      isOwner: boolean;
      roles: Array<{ _id: string; name: string; color: string; position: number }>;
      highestRolePosition: number;
      displayColor: string;
    }> = [];

    for (const m of server.members) {
      const uid = m.userId.toString();
      const profile = profileByUserId.get(uid) as
        | { displayName: string; username: string; avatarUrl: string }
        | undefined;

      // Lấy role info cho member này
      const roleInfo = await this.rolesService.getMemberRoleInfo(serverId, uid);

      membersResult.push({
        userId: uid,
        displayName: profile?.displayName ?? 'Người dùng',
        username: profile?.username ?? uid,
        avatarUrl: profile?.avatarUrl ?? '',
        joinedAt: m.joinedAt instanceof Date ? m.joinedAt : new Date(m.joinedAt),
        isOwner: server.ownerId.toString() === uid,
        roles: roleInfo.roles,
        highestRolePosition: roleInfo.highestRole?.position ?? 0,
        displayColor: roleInfo.displayColor,
      });
    }

    // Sắp xếp members theo role position (cao nhất lên trước)
    membersResult.sort((a, b) => {
      if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
      return b.highestRolePosition - a.highestRolePosition;
    });

    // Lấy quyền của user hiện tại
    const isOwner = server.ownerId.toString() === requesterUserId;
    const [canKick, canBan, canTimeout] = await Promise.all([
      this.rolesService.hasPermission(serverId, requesterUserId, 'kickMembers'),
      this.rolesService.hasPermission(serverId, requesterUserId, 'banMembers'),
      this.rolesService.hasPermission(serverId, requesterUserId, 'timeoutMembers'),
    ]);

    return {
      members: membersResult,
      currentUserPermissions: {
        canKick,
        canBan,
        canTimeout,
        isOwner,
      },
    };
  }

  // =====================================================
  // MODERATION ACTIONS (KICK, BAN, TIMEOUT)
  // =====================================================

  /**
   * Kick thành viên khỏi server
   * Yêu cầu: quyền kickMembers + role hierarchy cao hơn target
   */
  async kickMember(
    serverId: string,
    actorId: string,
    targetId: string,
    reason?: string,
  ): Promise<{ success: boolean; message: string }> {
    // Validate quyền và role hierarchy
    await this.rolesService.validateModerationAction(
      serverId,
      actorId,
      targetId,
      'kickMembers',
    );

    const server = await this.serverModel.findById(serverId).exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    // Xóa member khỏi server
    server.members = server.members.filter(
      (m) => m.userId.toString() !== targetId,
    );
    server.memberCount = server.members.length;
    await server.save();

    // Xóa member khỏi tất cả roles
    const roles = await this.rolesService.getRolesByServer(serverId);
    for (const role of roles) {
      if (!role.isDefault && role.memberIds.some((id) => id.toString() === targetId)) {
        role.memberIds = role.memberIds.filter((id) => id.toString() !== targetId);
        await role.save();
      }
    }

    return {
      success: true,
      message: `Đã kick thành viên${reason ? `. Lý do: ${reason}` : ''}`,
    };
  }

  /**
   * Ban thành viên khỏi server (không cho tham gia lại)
   * Yêu cầu: quyền banMembers + role hierarchy cao hơn target
   */
  async banMember(
    serverId: string,
    actorId: string,
    targetId: string,
    reason?: string,
    deleteMessageDays?: number,
  ): Promise<{ success: boolean; message: string }> {
    // Validate quyền và role hierarchy
    await this.rolesService.validateModerationAction(
      serverId,
      actorId,
      targetId,
      'banMembers',
    );

    const server = await this.serverModel.findById(serverId).exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    // Thêm vào danh sách ban (nếu chưa có trường này, sẽ cần update schema)
    if (!server.bannedUsers) {
      server.bannedUsers = [];
    }

    // Kiểm tra đã ban chưa
    const alreadyBanned = server.bannedUsers.some(
      (b) => b.userId.toString() === targetId,
    );
    if (alreadyBanned) {
      throw new BadRequestException('Người dùng này đã bị ban');
    }

    server.bannedUsers.push({
      userId: new Types.ObjectId(targetId),
      bannedAt: new Date(),
      bannedBy: new Types.ObjectId(actorId),
      reason: reason || null,
    });

    // Xóa member khỏi server
    server.members = server.members.filter(
      (m) => m.userId.toString() !== targetId,
    );
    server.memberCount = server.members.length;
    await server.save();

    // Xóa member khỏi tất cả roles
    const roles = await this.rolesService.getRolesByServer(serverId);
    for (const role of roles) {
      if (!role.isDefault && role.memberIds.some((id) => id.toString() === targetId)) {
        role.memberIds = role.memberIds.filter((id) => id.toString() !== targetId);
        await role.save();
      }
    }

    return {
      success: true,
      message: `Đã ban thành viên${reason ? `. Lý do: ${reason}` : ''}`,
    };
  }

  /**
   * Timeout (tạm khóa) thành viên trong khoảng thời gian
   * Yêu cầu: quyền timeoutMembers + role hierarchy cao hơn target
   */
  async timeoutMember(
    serverId: string,
    actorId: string,
    targetId: string,
    durationSeconds: number,
    reason?: string,
  ): Promise<{ success: boolean; message: string; timeoutUntil: Date }> {
    // Validate quyền và role hierarchy
    await this.rolesService.validateModerationAction(
      serverId,
      actorId,
      targetId,
      'timeoutMembers',
    );

    const server = await this.serverModel.findById(serverId).exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    // Tìm member và update timeout
    const memberIndex = server.members.findIndex(
      (m) => m.userId.toString() === targetId,
    );
    if (memberIndex === -1) {
      throw new BadRequestException('Người dùng không phải thành viên server');
    }

    const timeoutUntil = new Date(Date.now() + durationSeconds * 1000);
    server.members[memberIndex].timeoutUntil = timeoutUntil;
    await server.save();

    return {
      success: true,
      message: `Đã tạm khóa thành viên${reason ? `. Lý do: ${reason}` : ''}`,
      timeoutUntil,
    };
  }

  /**
   * Gỡ timeout cho thành viên
   */
  async removeTimeout(
    serverId: string,
    actorId: string,
    targetId: string,
  ): Promise<{ success: boolean; message: string }> {
    // Validate quyền
    await this.rolesService.validateModerationAction(
      serverId,
      actorId,
      targetId,
      'timeoutMembers',
    );

    const server = await this.serverModel.findById(serverId).exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    const memberIndex = server.members.findIndex(
      (m) => m.userId.toString() === targetId,
    );
    if (memberIndex === -1) {
      throw new BadRequestException('Người dùng không phải thành viên server');
    }

    server.members[memberIndex].timeoutUntil = null;
    await server.save();

    return {
      success: true,
      message: 'Đã gỡ tạm khóa cho thành viên',
    };
  }

  /**
   * Unban thành viên
   */
  async unbanMember(
    serverId: string,
    actorId: string,
    targetId: string,
  ): Promise<{ success: boolean; message: string }> {
    // Chỉ người có quyền ban mới có thể unban
    const hasBanPermission = await this.rolesService.hasPermission(
      serverId,
      actorId,
      'banMembers',
    );
    if (!hasBanPermission) {
      throw new ForbiddenException('Bạn không có quyền unban thành viên');
    }

    const server = await this.serverModel.findById(serverId).exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    if (!server.bannedUsers) {
      throw new BadRequestException('Người dùng này chưa bị ban');
    }

    const bannedIndex = server.bannedUsers.findIndex(
      (b) => b.userId.toString() === targetId,
    );
    if (bannedIndex === -1) {
      throw new BadRequestException('Người dùng này chưa bị ban');
    }

    server.bannedUsers.splice(bannedIndex, 1);
    await server.save();

    return {
      success: true,
      message: 'Đã gỡ ban cho thành viên',
    };
  }

  /**
   * Lấy danh sách người bị ban
   */
  async getBannedUsers(
    serverId: string,
    actorId: string,
  ): Promise<
    Array<{
      userId: string;
      username: string;
      displayName: string;
      avatarUrl: string;
      bannedAt: Date;
      reason: string | null;
    }>
  > {
    const hasBanPermission = await this.rolesService.hasPermission(
      serverId,
      actorId,
      'banMembers',
    );
    if (!hasBanPermission) {
      throw new ForbiddenException('Bạn không có quyền xem danh sách ban');
    }

    const server = await this.serverModel.findById(serverId).exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    if (!server.bannedUsers || server.bannedUsers.length === 0) {
      return [];
    }

    const bannedUserIds = server.bannedUsers.map((b) => b.userId);
    const profiles = await this.profileModel
      .find({ userId: { $in: bannedUserIds } })
      .select('userId displayName username avatarUrl')
      .lean()
      .exec();
    const profileMap = new Map(
      profiles.map((p: any) => [p.userId.toString(), p]),
    );

    return server.bannedUsers.map((b) => {
      const profile = profileMap.get(b.userId.toString()) as any;
      return {
        userId: b.userId.toString(),
        username: profile?.username ?? 'Người dùng',
        displayName: profile?.displayName ?? 'Người dùng',
        avatarUrl: profile?.avatarUrl ?? '',
        bannedAt: b.bannedAt,
        reason: b.reason,
      };
    });
  }

  /**
   * Kiểm tra user có bị ban không
   */
  async isUserBanned(serverId: string, userId: string): Promise<boolean> {
    const server = await this.serverModel.findById(serverId).exec();
    if (!server || !server.bannedUsers) return false;
    return server.bannedUsers.some((b) => b.userId.toString() === userId);
  }

  /**
   * Chuyển quyền sở hữu máy chủ: A (owner) chuyển cho B → B thành owner, A thành member.
   * Chỉ chủ hiện tại mới gọi được; newOwnerId phải là thành viên và không phải chủ hiện tại.
   */
  async transferOwnership(
    serverId: string,
    currentOwnerUserId: string,
    newOwnerId: string,
  ): Promise<Server> {
    const server = await this.serverModel.findById(serverId).exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }
    if (server.ownerId.toString() !== currentOwnerUserId) {
      throw new ForbiddenException('Chỉ chủ máy chủ mới có thể chuyển quyền sở hữu');
    }
    if (newOwnerId === currentOwnerUserId) {
      throw new BadRequestException('Không thể chuyển quyền cho chính mình');
    }
    const newOwnerObjectId = new Types.ObjectId(newOwnerId);
    const currentOwnerObjectId = new Types.ObjectId(currentOwnerUserId);
    const newOwnerMember = server.members.find(
      (m) => m.userId.toString() === newOwnerId,
    );
    if (!newOwnerMember) {
      throw new BadRequestException('Người nhận phải là thành viên của máy chủ');
    }

    server.ownerId = newOwnerObjectId;
    for (let i = 0; i < server.members.length; i++) {
      const m = server.members[i];
      if (m.userId.equals(currentOwnerObjectId)) {
        server.members[i].role = 'member';
      } else if (m.userId.equals(newOwnerObjectId)) {
        server.members[i].role = 'owner';
      }
    }
    await server.save();
    return server;
  }
}