import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message } from './message.schema';
import { Channel } from '../channels/channel.schema';
import { CreateMessageDto } from './dto/create-message.dto';

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<Message>,
    @InjectModel(Channel.name) private channelModel: Model<Channel>,
  ) {}

  async createMessage(
    channelId: string,
    createMessageDto: CreateMessageDto,
    userId: string,
  ): Promise<Message> {
    const channel = await this.channelModel.findById(channelId);

    if (!channel) {
      throw new NotFoundException(`Channel with id ${channelId} not found`);
    }

    const userObjectId = new Types.ObjectId(userId);

    const message = new this.messageModel({
      channelId: new Types.ObjectId(channelId),
      senderId: userObjectId,
      content: createMessageDto.content,
      attachments: createMessageDto.attachments || [],
    });

    const savedMessage = await message.save();

    // Update channel message count
    channel.messageCount = (channel.messageCount || 0) + 1;
    await channel.save();

    return savedMessage;
  }

  async getMessagesByChannelId(
    channelId: string,
    limit: number = 50,
    skip: number = 0,
  ): Promise<Message[]> {
    return this.messageModel
      .find({
        channelId: new Types.ObjectId(channelId),
        isDeleted: false,
      })
      .populate('senderId', 'email')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .exec();
  }

  async getMessageById(messageId: string): Promise<Message> {
    const message = await this.messageModel
      .findById(messageId)
      .populate('senderId', 'email')
      .exec();

    if (!message) {
      throw new NotFoundException(`Message with id ${messageId} not found`);
    }

    return message;
  }

  async updateMessage(
    messageId: string,
    content: string,
    userId: string,
  ): Promise<Message> {
    const message = await this.messageModel.findById(messageId);

    if (!message) {
      throw new NotFoundException(`Message with id ${messageId} not found`);
    }

    // Check if user is sender
    if (message.senderId.toString() !== userId) {
      throw new ForbiddenException(
        'You can only edit your own messages',
      );
    }

    message.content = content;
    message.isEdited = true;
    message.editedAt = new Date();

    return message.save();
  }

  async deleteMessage(messageId: string, userId: string): Promise<void> {
    const message = await this.messageModel.findById(messageId);

    if (!message) {
      throw new NotFoundException(`Message with id ${messageId} not found`);
    }

    // Check if user is sender
    if (message.senderId.toString() !== userId) {
      throw new ForbiddenException(
        'You can only delete your own messages',
      );
    }

    message.isDeleted = true;
    await message.save();

    // Update channel message count
    const channel = await this.channelModel.findById(message.channelId);
    if (channel && channel.messageCount > 0) {
      channel.messageCount -= 1;
      await channel.save();
    }
  }

  async addReaction(
    messageId: string,
    emoji: string,
    userId: string,
  ): Promise<Message> {
    const message = await this.messageModel.findById(messageId);

    if (!message) {
      throw new NotFoundException(`Message with id ${messageId} not found`);
    }

    const userObjectId = new Types.ObjectId(userId);

    // Check if user already reacted with this emoji
    const existingReaction = message.reactions.find(
      (r) => r.userId.toString() === userId && r.emoji === emoji,
    );

    if (existingReaction) {
      // Remove reaction
      message.reactions = message.reactions.filter(
        (r) => !(r.userId.toString() === userId && r.emoji === emoji),
      );
    } else {
      // Add reaction
      message.reactions.push({
        userId: userObjectId,
        emoji,
      });
    }

    return message.save();
  }
}
