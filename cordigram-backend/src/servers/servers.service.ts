import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Server } from './server.schema';
import { Channel } from '../channels/channel.schema';
import { CreateServerDto } from './dto/create-server.dto';
import { UpdateServerDto } from './dto/update-server.dto';

@Injectable()
export class ServersService {
  constructor(
    @InjectModel(Server.name) private serverModel: Model<Server>,
    @InjectModel(Channel.name) private channelModel: Model<Channel>,
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
      ownerId: userObjectId,
      members: [
        {
          userId: userObjectId,
          role: 'owner',
          joinedAt: new Date(),
        },
      ],
      memberCount: 1,
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

    return server.save();
  }

  async deleteServer(serverId: string, userId: string): Promise<void> {
    const server = await this.serverModel.findById(serverId);

    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    // Check if user is owner
    if (server.ownerId.toString() !== userId) {
      throw new ForbiddenException(
        'Only server owner can delete the server',
      );
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
}
