import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Channel, ChannelType } from './channel.schema';
import { Server } from '../servers/server.schema';
import { CreateChannelDto } from './dto/create-channel.dto';

@Injectable()
export class ChannelsService {
  constructor(
    @InjectModel(Channel.name) private channelModel: Model<Channel>,
    @InjectModel(Server.name) private serverModel: Model<Server>,
  ) {}

  async createChannel(
    serverId: string,
    createChannelDto: CreateChannelDto,
    userId: string,
  ): Promise<Channel> {
    const server = await this.serverModel.findById(serverId);

    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    // Check if user is owner or moderator
    const userMember = server.members.find(
      (m) => m.userId.toString() === userId,
    );

    if (!userMember || !['owner', 'moderator'].includes(userMember.role)) {
      throw new ForbiddenException(
        'Only owner or moderator can create channels',
      );
    }

    const userObjectId = new Types.ObjectId(userId);

    const channel = new this.channelModel({
      name: createChannelDto.name,
      type: createChannelDto.type,
      description: createChannelDto.description || null,
      serverId: new Types.ObjectId(serverId),
      createdBy: userObjectId,
      isDefault: false,
    });

    const savedChannel = await channel.save();

    // Add channel to server
    server.channels.push(savedChannel._id);
    await server.save();

    return savedChannel;
  }

  async getChannelsByServerId(serverId: string): Promise<Channel[]> {
    return this.channelModel
      .find({ serverId: new Types.ObjectId(serverId) })
      .populate('createdBy', 'email')
      .exec();
  }

  async getChannelById(channelId: string): Promise<Channel> {
    const channel = await this.channelModel
      .findById(channelId)
      .populate('createdBy', 'email')
      .exec();

    if (!channel) {
      throw new NotFoundException(`Channel with id ${channelId} not found`);
    }

    return channel;
  }

  async updateChannel(
    channelId: string,
    name?: string,
    description?: string,
    userId?: string,
  ): Promise<Channel> {
    const channel = await this.channelModel.findById(channelId);

    if (!channel) {
      throw new NotFoundException(`Channel with id ${channelId} not found`);
    }

    // Check permissions
    if (userId && channel.createdBy.toString() !== userId) {
      throw new ForbiddenException(
        'Only channel creator can update channel details',
      );
    }

    if (name) channel.name = name;
    if (description !== undefined) channel.description = description;

    return channel.save();
  }

  async deleteChannel(channelId: string, userId: string): Promise<void> {
    const channel = await this.channelModel.findById(channelId);

    if (!channel) {
      throw new NotFoundException(`Channel with id ${channelId} not found`);
    }

    // Check if is default channel
    if (channel.isDefault) {
      throw new BadRequestException('Cannot delete default channel');
    }

    // Check permissions
    if (channel.createdBy.toString() !== userId) {
      throw new ForbiddenException(
        'Only channel creator can delete the channel',
      );
    }

    // Remove channel from server
    await this.serverModel.findByIdAndUpdate(
      channel.serverId,
      { $pull: { channels: channelId } },
      { new: true },
    );

    // Delete channel
    await this.channelModel.findByIdAndDelete(channelId);
  }

  async getChannelsByType(
    serverId: string,
    type: ChannelType,
  ): Promise<Channel[]> {
    return this.channelModel
      .find({
        serverId: new Types.ObjectId(serverId),
        type,
      })
      .populate('createdBy', 'email')
      .exec();
  }
}
