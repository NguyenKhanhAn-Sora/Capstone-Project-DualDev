import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Role,
  RolePermissions,
  DEFAULT_EVERYONE_PERMISSIONS,
  DEFAULT_NEW_ROLE_PERMISSIONS,
} from './role.schema';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto, ReorderRolesDto } from './dto/update-role.dto';
import { Server } from '../servers/server.schema';

@Injectable()
export class RolesService {
  constructor(
    @InjectModel(Role.name) private roleModel: Model<Role>,
    @InjectModel(Server.name) private serverModel: Model<Server>,
  ) {}

  /**
   * Tạo role @everyone mặc định khi tạo server mới
   */
  async createDefaultRole(serverId: string): Promise<Role> {
    const role = new this.roleModel({
      name: '@everyone',
      color: '#99AAB5',
      serverId: new Types.ObjectId(serverId),
      position: 0,
      displaySeparately: false,
      mentionable: false,
      isDefault: true,
      permissions: { ...DEFAULT_EVERYONE_PERMISSIONS },
      memberIds: [],
    });
    return role.save();
  }

  /**
   * Lấy danh sách tất cả roles của một server
   */
  async getRolesByServer(serverId: string): Promise<Role[]> {
    return this.roleModel
      .find({ serverId: new Types.ObjectId(serverId) })
      .sort({ position: -1 }) // Roles có position cao hơn hiển thị trước
      .exec();
  }

  /**
   * Lấy chi tiết một role
   */
  async getRoleById(serverId: string, roleId: string): Promise<Role> {
    const role = await this.roleModel
      .findOne({
        _id: new Types.ObjectId(roleId),
        serverId: new Types.ObjectId(serverId),
      })
      .exec();

    if (!role) {
      throw new NotFoundException('Role not found');
    }
    return role;
  }

  /**
   * Tạo role mới
   */
  async createRole(
    serverId: string,
    userId: string,
    createRoleDto: CreateRoleDto,
  ): Promise<Role> {
    // Kiểm tra quyền (chỉ owner mới được tạo role)
    await this.checkOwnerPermission(serverId, userId);

    // Lấy position cao nhất hiện tại
    const highestRole = await this.roleModel
      .findOne({ serverId: new Types.ObjectId(serverId) })
      .sort({ position: -1 })
      .exec();

    const newPosition =
      createRoleDto.position ?? (highestRole ? highestRole.position + 1 : 1);

    const permissions: RolePermissions = {
      ...DEFAULT_NEW_ROLE_PERMISSIONS,
      ...(createRoleDto.permissions || {}),
    };

    const role = new this.roleModel({
      name: createRoleDto.name,
      color: createRoleDto.color || '#99AAB5',
      icon: createRoleDto.icon || null,
      serverId: new Types.ObjectId(serverId),
      position: newPosition,
      displaySeparately: createRoleDto.displaySeparately ?? false,
      mentionable: createRoleDto.mentionable ?? false,
      isDefault: false,
      permissions,
      memberIds: [],
    });

    return role.save();
  }

  /**
   * Cập nhật role
   */
  async updateRole(
    serverId: string,
    roleId: string,
    userId: string,
    updateRoleDto: UpdateRoleDto,
  ): Promise<Role> {
    await this.checkOwnerPermission(serverId, userId);

    const role = await this.getRoleById(serverId, roleId);

    // Không cho phép đổi tên role @everyone
    if (
      role.isDefault &&
      updateRoleDto.name &&
      updateRoleDto.name !== '@everyone'
    ) {
      throw new BadRequestException('Cannot rename the @everyone role');
    }

    // Cập nhật các fields
    if (updateRoleDto.name !== undefined && !role.isDefault) {
      role.name = updateRoleDto.name;
    }
    if (updateRoleDto.color !== undefined) {
      role.color = updateRoleDto.color;
    }
    if (updateRoleDto.icon !== undefined) {
      role.icon = updateRoleDto.icon;
    }
    if (updateRoleDto.position !== undefined && !role.isDefault) {
      role.position = updateRoleDto.position;
    }
    if (updateRoleDto.displaySeparately !== undefined) {
      role.displaySeparately = updateRoleDto.displaySeparately;
    }
    if (updateRoleDto.mentionable !== undefined) {
      role.mentionable = updateRoleDto.mentionable;
    }
    if (updateRoleDto.permissions !== undefined) {
      role.permissions = {
        ...role.permissions,
        ...updateRoleDto.permissions,
      };
    }

    return role.save();
  }

  /**
   * Xóa role
   */
  async deleteRole(
    serverId: string,
    roleId: string,
    userId: string,
  ): Promise<void> {
    await this.checkOwnerPermission(serverId, userId);

    const role = await this.getRoleById(serverId, roleId);

    // Không cho phép xóa role @everyone
    if (role.isDefault) {
      throw new BadRequestException('Cannot delete the @everyone role');
    }

    await this.roleModel.deleteOne({ _id: new Types.ObjectId(roleId) }).exec();
  }

  /**
   * Sắp xếp lại thứ tự roles
   */
  async reorderRoles(
    serverId: string,
    userId: string,
    reorderDto: ReorderRolesDto,
  ): Promise<Role[]> {
    await this.checkOwnerPermission(serverId, userId);

    const { roleIds } = reorderDto;

    // Cập nhật position cho từng role (index 0 = highest position)
    const bulkOps = roleIds.map((roleId, index) => ({
      updateOne: {
        filter: {
          _id: new Types.ObjectId(roleId),
          serverId: new Types.ObjectId(serverId),
          isDefault: false, // Không cho phép thay đổi position của @everyone
        },
        update: { $set: { position: roleIds.length - index } },
      },
    }));

    await this.roleModel.bulkWrite(bulkOps);

    return this.getRolesByServer(serverId);
  }

  /**
   * Lấy danh sách members của một role
   */
  async getRoleMembers(
    serverId: string,
    roleId: string,
  ): Promise<Types.ObjectId[]> {
    const role = await this.getRoleById(serverId, roleId);
    return role.memberIds;
  }

  /**
   * Thêm member vào role
   */
  async addMemberToRole(
    serverId: string,
    roleId: string,
    memberId: string,
    userId: string,
  ): Promise<Role> {
    await this.checkOwnerPermission(serverId, userId);

    const role = await this.getRoleById(serverId, roleId);
    const memberObjectId = new Types.ObjectId(memberId);

    // Kiểm tra member có trong server không
    const server = await this.serverModel
      .findOne({
        _id: new Types.ObjectId(serverId),
        'members.userId': memberObjectId,
      })
      .exec();

    if (!server) {
      throw new BadRequestException('Member is not part of this server');
    }

    // Kiểm tra member đã có role này chưa
    if (role.memberIds.some((id) => id.equals(memberObjectId))) {
      throw new BadRequestException('Member already has this role');
    }

    role.memberIds.push(memberObjectId);
    return role.save();
  }

  /**
   * Xóa member khỏi role
   */
  async removeMemberFromRole(
    serverId: string,
    roleId: string,
    memberId: string,
    userId: string,
  ): Promise<Role> {
    await this.checkOwnerPermission(serverId, userId);

    const role = await this.getRoleById(serverId, roleId);

    // Không cho phép xóa member khỏi role @everyone
    if (role.isDefault) {
      throw new BadRequestException(
        'Cannot remove members from @everyone role',
      );
    }

    const memberObjectId = new Types.ObjectId(memberId);
    role.memberIds = role.memberIds.filter((id) => !id.equals(memberObjectId));
    return role.save();
  }

  /**
   * Lấy tất cả roles của một member trong server
   */
  async getMemberRoles(serverId: string, memberId: string): Promise<Role[]> {
    return this.roleModel
      .find({
        serverId: new Types.ObjectId(serverId),
        $or: [
          { memberIds: new Types.ObjectId(memberId) },
          { isDefault: true }, // @everyone áp dụng cho tất cả
        ],
      })
      .sort({ position: -1 })
      .exec();
  }

  /**
   * Tính toán permissions tổng hợp của một member (OR tất cả roles)
   */
  async calculateMemberPermissions(
    serverId: string,
    memberId: string,
  ): Promise<RolePermissions> {
    const roles = await this.getMemberRoles(serverId, memberId);

    // Bắt đầu với tất cả false
    const result: RolePermissions = {
      // Quyền Quản Lý Máy Chủ
      manageServer: false,
      manageChannels: false,
      manageEvents: false,
      // Quyền Thành Viên
      createInvite: false,
      changeNickname: false,
      manageNicknames: false,
      kickMembers: false,
      banMembers: false,
      timeoutMembers: false,
      sendMessages: false,
      sendMessagesInThreads: false,
      createPublicThreads: false,
      createPrivateThreads: false,
      embedLinks: false,
      attachFiles: false,
      addReactions: false,
      manageMessages: false,
      pinMessages: false,
      bypassSlowMode: false,
      manageThreads: false,
      viewMessageHistory: false,
      sendTTS: false,
      sendVoiceMessages: false,
      createPolls: false,
      connect: false,
      speak: false,
      video: false,
      muteMembers: false,
      deafenMembers: false,
      moveMembers: false,
      setVoiceChannelStatus: false,
    };

    // OR tất cả permissions từ các roles
    for (const role of roles) {
      for (const key of Object.keys(result) as (keyof RolePermissions)[]) {
        if (role.permissions[key]) {
          result[key] = true;
        }
      }
    }

    return result;
  }

  /**
   * Xóa tất cả roles của một server (dùng khi xóa server)
   */
  async deleteRolesByServer(serverId: string): Promise<void> {
    await this.roleModel
      .deleteMany({ serverId: new Types.ObjectId(serverId) })
      .exec();
  }

  // =====================================================
  // ROLE HIERARCHY & PERMISSION UTILITIES
  // =====================================================

  /**
   * Lấy role cao nhất (position lớn nhất) của một member
   * Role cao nhất quyết định màu hiển thị và quyền hạn mạnh nhất
   */
  async getHighestRole(
    serverId: string,
    memberId: string,
  ): Promise<Role | null> {
    const roles = await this.getMemberRoles(serverId, memberId);
    if (roles.length === 0) return null;
    // Roles đã được sort theo position DESC, nên role đầu tiên là cao nhất
    return roles[0];
  }

  /**
   * Lấy position cao nhất của một member
   * Dùng để so sánh role hierarchy
   */
  async getHighestPosition(
    serverId: string,
    memberId: string,
  ): Promise<number> {
    const highestRole = await this.getHighestRole(serverId, memberId);
    return highestRole ? highestRole.position : 0;
  }

  /**
   * Kiểm tra member có quyền cụ thể không
   * @param serverId - ID server
   * @param memberId - ID member cần kiểm tra
   * @param permission - Tên permission cần kiểm tra
   * @returns true nếu có quyền, false nếu không
   */
  async hasPermission(
    serverId: string,
    memberId: string,
    permission: keyof RolePermissions,
  ): Promise<boolean> {
    // Owner luôn có tất cả quyền
    const server = await this.serverModel.findById(serverId).exec();
    if (server && server.ownerId.toString() === memberId) {
      return true;
    }

    const permissions = await this.calculateMemberPermissions(
      serverId,
      memberId,
    );
    return permissions[permission] === true;
  }

  /**
   * Kiểm tra user A có thể tác động (kick/ban/timeout) đến user B không
   * Quy tắc: Chỉ có thể tác động đến user có role position THẤP HƠN
   *
   * @param serverId - ID server
   * @param actorId - ID user thực hiện hành động
   * @param targetId - ID user bị tác động
   * @returns true nếu có thể tác động, false nếu không
   */
  async canAffectUser(
    serverId: string,
    actorId: string,
    targetId: string,
  ): Promise<boolean> {
    const server = await this.serverModel.findById(serverId).exec();
    if (!server) return false;

    // Không thể tự tác động chính mình
    if (actorId === targetId) return false;

    // Không thể tác động đến owner
    if (server.ownerId.toString() === targetId) return false;

    // Owner có thể tác động đến bất kỳ ai (trừ chính mình)
    if (server.ownerId.toString() === actorId) return true;

    // So sánh position của role cao nhất
    const actorPosition = await this.getHighestPosition(serverId, actorId);
    const targetPosition = await this.getHighestPosition(serverId, targetId);

    // Chỉ có thể tác động nếu position cao hơn STRICTLY
    return actorPosition > targetPosition;
  }

  /**
   * Lấy thông tin role đầy đủ cho một member (dùng để hiển thị UI)
   * Bao gồm: danh sách roles, role cao nhất, màu hiển thị
   */
  async getMemberRoleInfo(
    serverId: string,
    memberId: string,
  ): Promise<{
    roles: Array<{
      _id: string;
      name: string;
      color: string;
      position: number;
    }>;
    highestRole: {
      _id: string;
      name: string;
      color: string;
      position: number;
    } | null;
    displayColor: string;
  }> {
    const roles = await this.getMemberRoles(serverId, memberId);

    // DEBUG: Log roles tìm được

    const roleInfos = roles
      .filter((r) => !r.isDefault) // Không hiển thị @everyone trong danh sách badges
      .map((r) => ({
        _id: r._id.toString(),
        name: r.name,
        color: r.color,
        position: r.position,
      }));

    // Role cao nhất (không tính @everyone)
    const highestNonDefaultRole = roles.find((r) => !r.isDefault);
    const highestRole = highestNonDefaultRole
      ? {
          _id: highestNonDefaultRole._id.toString(),
          name: highestNonDefaultRole.name,
          color: highestNonDefaultRole.color,
          position: highestNonDefaultRole.position,
        }
      : null;

    // Màu hiển thị: lấy từ role cao nhất có màu khác default
    // Nếu không có role nào thì dùng màu mặc định
    const displayColor = highestRole?.color || '#99AAB5';

    // DEBUG: Log kết quả

    return {
      roles: roleInfos,
      highestRole,
      displayColor,
    };
  }

  /**
   * Kiểm tra và thực hiện hành động moderation (kick/ban/timeout)
   * @param serverId - ID server
   * @param actorId - ID user thực hiện hành động
   * @param targetId - ID user bị tác động
   * @param requiredPermission - Quyền cần thiết để thực hiện hành động
   * @throws ForbiddenException nếu không có quyền
   */
  async validateModerationAction(
    serverId: string,
    actorId: string,
    targetId: string,
    requiredPermission: keyof RolePermissions,
  ): Promise<void> {
    // Kiểm tra có quyền không
    const hasPermissionResult = await this.hasPermission(
      serverId,
      actorId,
      requiredPermission,
    );

    if (!hasPermissionResult) {
      throw new ForbiddenException(
        `Bạn không có quyền "${requiredPermission}" để thực hiện hành động này`,
      );
    }

    // Kiểm tra role hierarchy
    const canAffect = await this.canAffectUser(serverId, actorId, targetId);
    if (!canAffect) {
      throw new ForbiddenException(
        'Bạn không thể tác động đến người dùng có role cao hơn hoặc bằng bạn',
      );
    }
  }

  /**
   * Kiểm tra user có phải owner của server không
   */
  private async checkOwnerPermission(
    serverId: string,
    userId: string,
  ): Promise<void> {
    const server = await this.serverModel
      .findOne({
        _id: new Types.ObjectId(serverId),
        ownerId: new Types.ObjectId(userId),
      })
      .exec();

    if (!server) {
      throw new ForbiddenException('Only server owner can manage roles');
    }
  }

  /**
   * Kiểm tra user có phải owner không (public method)
   */
  async isServerOwner(serverId: string, userId: string): Promise<boolean> {
    const server = await this.serverModel
      .findOne({
        _id: new Types.ObjectId(serverId),
        ownerId: new Types.ObjectId(userId),
      })
      .exec();
    return !!server;
  }
}
