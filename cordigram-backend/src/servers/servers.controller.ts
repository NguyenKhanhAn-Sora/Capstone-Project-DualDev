import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { ServersService } from './servers.service';
import { CreateServerDto } from './dto/create-server.dto';
import { UpdateServerDto } from './dto/update-server.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('servers')
@UseGuards(JwtAuthGuard)
export class ServersController {
  constructor(private readonly serversService: ServersService) {}

  @Post()
  async createServer(
    @Body() createServerDto: CreateServerDto,
    @Request() req: any,
  ) {
    return this.serversService.createServer(createServerDto, req.user.userId);
  }

  @Get()
  async getMyServers(@Request() req: any) {
    return this.serversService.getServersByUserId(req.user.userId);
  }

  @Get(':id/members')
  async getServerMembers(
    @Param('id') serverId: string,
    @Request() req: any,
  ) {
    return this.serversService.getServerMembers(serverId, req.user.userId);
  }

  @Get(':id')
  async getServer(@Param('id') serverId: string) {
    return this.serversService.getServerById(serverId);
  }

  @Patch(':id')
  async updateServer(
    @Param('id') serverId: string,
    @Body() updateServerDto: UpdateServerDto,
    @Request() req: any,
  ) {
    return this.serversService.updateServer(
      serverId,
      updateServerDto,
      req.user.userId,
    );
  }

  @Delete(':id')
  async deleteServer(@Param('id') serverId: string, @Request() req: any) {
    await this.serversService.deleteServer(serverId, req.user.userId);
    return { message: 'Server deleted successfully' };
  }

  @Post(':id/join')
  async joinServer(@Param('id') serverId: string, @Request() req: any) {
    return this.serversService.joinServer(serverId, req.user.userId);
  }

  @Post(':id/leave')
  async leaveServer(@Param('id') serverId: string, @Request() req: any) {
    await this.serversService.leaveServer(serverId, req.user.userId);
    return { message: 'Left server successfully' };
  }

  @Post(':id/members/:memberId')
  async addMember(
    @Param('id') serverId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.serversService.addMemberToServer(serverId, memberId);
  }

  @Delete(':id/members/:memberId')
  async removeMember(
    @Param('id') serverId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
  ) {
    return this.serversService.removeMemberFromServer(
      serverId,
      memberId,
      req.user.userId,
    );
  }

  @Patch(':id/transfer-ownership')
  async transferOwnership(
    @Param('id') serverId: string,
    @Body() body: { newOwnerId: string },
    @Request() req: any,
  ) {
    if (!body?.newOwnerId) {
      throw new BadRequestException('newOwnerId is required');
    }
    return this.serversService.transferOwnership(
      serverId,
      req.user.userId,
      body.newOwnerId,
    );
  }
}
