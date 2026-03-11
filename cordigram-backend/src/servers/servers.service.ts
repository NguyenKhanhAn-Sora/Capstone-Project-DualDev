import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
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

@Injectable()
export class ServersService {
  constructor(
    @InjectModel(Server.name) private serverModel: Model<Server>,
    @InjectModel(Channel.name) private channelModel: Model<Channel>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Profile.name) private profileModel: Model<Profile>,
    @InjectModel(ServerInvite.name) private serverInviteModel: Model<ServerInvite>,
  ) {}

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
