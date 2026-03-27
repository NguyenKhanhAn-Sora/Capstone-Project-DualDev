import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto, ReorderRolesDto } from './dto/update-role.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('servers/:serverId/roles')
@UseGuards(JwtAuthGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  /**
   * GET /servers/:serverId/roles
   * Lấy danh sách tất cả roles của server
   */
  @Get()
  async getRoles(@Param('serverId') serverId: string) {
    return this.rolesService.getRolesByServer(serverId);
  }

  /**
   * POST /servers/:serverId/roles
   * Tạo role mới
   */
  @Post()
  async createRole(
    @Param('serverId') serverId: string,
    @Body() createRoleDto: CreateRoleDto,
    @Request() req: any,
  ) {
    return this.rolesService.createRole(serverId, req.user.userId, createRoleDto);
  }

  /**
   * GET /servers/:serverId/roles/:roleId
   * Lấy chi tiết một role
   */
  @Get(':roleId')
  async getRole(
    @Param('serverId') serverId: string,
    @Param('roleId') roleId: string,
  ) {
    return this.rolesService.getRoleById(serverId, roleId);
  }

  /**
   * PATCH /servers/:serverId/roles/:roleId
   * Cập nhật role
   */
  @Patch(':roleId')
  async updateRole(
    @Param('serverId') serverId: string,
    @Param('roleId') roleId: string,
    @Body() updateRoleDto: UpdateRoleDto,
    @Request() req: any,
  ) {
    return this.rolesService.updateRole(
      serverId,
      roleId,
      req.user.userId,
      updateRoleDto,
    );
  }

  /**
   * DELETE /servers/:serverId/roles/:roleId
   * Xóa role
   */
  @Delete(':roleId')
  async deleteRole(
    @Param('serverId') serverId: string,
    @Param('roleId') roleId: string,
    @Request() req: any,
  ) {
    await this.rolesService.deleteRole(serverId, roleId, req.user.userId);
    return { success: true };
  }

  /**
   * PATCH /servers/:serverId/roles/reorder
   * Sắp xếp lại thứ tự roles
   */
  @Patch('reorder')
  async reorderRoles(
    @Param('serverId') serverId: string,
    @Body() reorderDto: ReorderRolesDto,
    @Request() req: any,
  ) {
    return this.rolesService.reorderRoles(serverId, req.user.userId, reorderDto);
  }

  /**
   * GET /servers/:serverId/roles/:roleId/members
   * Lấy danh sách members của role
   */
  @Get(':roleId/members')
  async getRoleMembers(
    @Param('serverId') serverId: string,
    @Param('roleId') roleId: string,
  ) {
    return this.rolesService.getRoleMembers(serverId, roleId);
  }

  /**
   * POST /servers/:serverId/roles/:roleId/members/:memberId
   * Thêm member vào role
   */
  @Post(':roleId/members/:memberId')
  async addMemberToRole(
    @Param('serverId') serverId: string,
    @Param('roleId') roleId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
  ) {
    return this.rolesService.addMemberToRole(
      serverId,
      roleId,
      memberId,
      req.user.userId,
    );
  }

  /**
   * DELETE /servers/:serverId/roles/:roleId/members/:memberId
   * Xóa member khỏi role
   */
  @Delete(':roleId/members/:memberId')
  async removeMemberFromRole(
    @Param('serverId') serverId: string,
    @Param('roleId') roleId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
  ) {
    return this.rolesService.removeMemberFromRole(
      serverId,
      roleId,
      memberId,
      req.user.userId,
    );
  }
}
