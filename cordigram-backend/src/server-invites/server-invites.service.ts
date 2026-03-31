import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ServerInvite } from './server-invite.schema';
import { ServersService } from '../servers/servers.service';

@Injectable()
export class ServerInvitesService {
  constructor(
    @InjectModel(ServerInvite.name) private inviteModel: Model<ServerInvite>,
    private readonly serversService: ServersService,
  ) {}

  /** Tạo lời mời vào máy chủ (chỉ thành viên server mới mời được). */
  async create(
    fromUserId: string,
    toUserId: string,
    serverId: string,
  ): Promise<ServerInvite> {
    const server = await this.serversService.getServerById(serverId);
    if (!this.serversService.isMember(server, fromUserId)) {
      throw new ForbiddenException('Chỉ thành viên máy chủ mới có thể mời.');
    }
    if (this.serversService.isMember(server, toUserId)) {
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
    return invite.save();
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
    await this.serversService.addMemberToServer(
      invite.serverId.toString(),
      userId,
      'member',
    );
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
    if (!invite)
      throw new NotFoundException('Không tìm thấy lời mời hoặc đã xử lý.');
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
