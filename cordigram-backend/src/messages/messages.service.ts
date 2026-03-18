import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message } from './message.schema';
import { Channel } from '../channels/channel.schema';
import { Profile } from '../profiles/profile.schema';
import { ChannelReadState } from './channel-read-state.schema';
import { CreateMessageDto } from './dto/create-message.dto';
import { IgnoredService } from '../users/ignored.service';

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<Message>,
    @InjectModel(Channel.name) private channelModel: Model<Channel>,
    @InjectModel(Profile.name) private profileModel: Model<Profile>,
    @InjectModel(ChannelReadState.name)
    private channelReadStateModel: Model<ChannelReadState>,
    private readonly ignoredService: IgnoredService,
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
      replyTo: createMessageDto.replyTo
        ? new Types.ObjectId(createMessageDto.replyTo)
        : null,
    });

    const savedMessage = await message.save();

    // Update channel message count
    channel.messageCount = (channel.messageCount || 0) + 1;
    await channel.save();

    const enriched = await this.getMessageByIdEnriched(savedMessage._id.toString());
    return enriched as any;
  }

  async getMessageByIdEnriched(messageId: string): Promise<any> {
    const msg = await this.messageModel
      .findById(messageId)
      .populate('senderId', 'email')
      .populate({
        path: 'replyTo',
        populate: { path: 'senderId', select: 'email' },
      })
      .lean()
      .exec();

    if (!msg) return null;

    const senderId = msg.senderId?._id ?? msg.senderId;
    const senderUserId = senderId != null ? new Types.ObjectId(senderId.toString()) : null;
    const senderProfile = senderUserId
      ? await this.profileModel
          .findOne({ userId: senderUserId })
          .select('username displayName avatarUrl')
          .lean()
          .exec()
      : null;

    const result: any = {
      ...msg,
      senderId: {
        ...(typeof msg.senderId === 'object' ? msg.senderId : { _id: msg.senderId, email: '' }),
        displayName: senderProfile?.displayName ?? undefined,
        username: senderProfile?.username ?? undefined,
        avatarUrl: senderProfile?.avatarUrl ?? undefined,
      },
    };

    const replyToRaw = msg.replyTo as any;
    if (replyToRaw && typeof replyToRaw === 'object') {
      const rtSenderId = replyToRaw.senderId?._id ?? replyToRaw.senderId;
      const rtUserId = rtSenderId != null ? new Types.ObjectId(rtSenderId.toString()) : null;
      const rtProfile = rtUserId
        ? await this.profileModel
            .findOne({ userId: rtUserId })
            .select('username displayName avatarUrl')
            .lean()
            .exec()
        : null;
      result.replyTo = {
        ...replyToRaw,
        senderId: {
          ...(typeof replyToRaw.senderId === 'object'
            ? replyToRaw.senderId
            : { _id: replyToRaw.senderId, email: '' }),
          displayName: rtProfile?.displayName ?? undefined,
          username: rtProfile?.username ?? undefined,
        },
      };
    }

    return result;
  }

  async getMessagesByChannelId(
    channelId: string,
    limit: number = 50,
    skip: number = 0,
    viewerId?: string,
  ): Promise<any[]> {
    const match: any = {
      channelId: new Types.ObjectId(channelId),
      isDeleted: false,
    };
    if (viewerId) {
      const ignoredSet = await this.ignoredService.getIgnoredUserIds(viewerId);
      if (ignoredSet.size > 0) {
        match.senderId = { $nin: Array.from(ignoredSet).map((id) => new Types.ObjectId(id)) };
      }
    }
    const messages = await this.messageModel
      .find(match)
      .populate('senderId', 'email')
      .populate({
        path: 'replyTo',
        populate: { path: 'senderId', select: 'email' },
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean()
      .exec();

    const enriched = await Promise.all(
      messages.map(async (msg: any) => {
        const senderId = msg.senderId?._id ?? msg.senderId;
        const senderUserId = senderId != null ? new Types.ObjectId(senderId.toString()) : null;
        const senderProfile = senderUserId
          ? await this.profileModel
              .findOne({ userId: senderUserId })
              .select('username displayName avatarUrl')
              .lean()
              .exec()
          : null;

        const result: any = {
          ...msg,
          senderId: {
            ...(typeof msg.senderId === 'object' ? msg.senderId : { _id: msg.senderId, email: '' }),
            displayName: senderProfile?.displayName ?? undefined,
            username: senderProfile?.username ?? undefined,
            avatarUrl: senderProfile?.avatarUrl ?? undefined,
          },
        };

        const replyToRaw = msg.replyTo as any;
        if (replyToRaw && typeof replyToRaw === 'object') {
          const rtSenderId = replyToRaw.senderId?._id ?? replyToRaw.senderId;
          const rtUserId = rtSenderId != null ? new Types.ObjectId(rtSenderId.toString()) : null;
          const rtProfile = rtUserId
            ? await this.profileModel
                .findOne({ userId: rtUserId })
                .select('username displayName avatarUrl')
                .lean()
                .exec()
            : null;
          result.replyTo = {
            ...replyToRaw,
            senderId: {
              ...(typeof replyToRaw.senderId === 'object'
                ? replyToRaw.senderId
                : { _id: replyToRaw.senderId, email: '' }),
              displayName: rtProfile?.displayName ?? undefined,
              username: rtProfile?.username ?? undefined,
            },
          };
        }

        return result;
      }),
    );

    return enriched;
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
      throw new ForbiddenException('You can only edit your own messages');
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
      throw new ForbiddenException('You can only delete your own messages');
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

  /** Đánh dấu toàn bộ tin nhắn trong kênh là đã đọc đến thời điểm hiện tại. */
  async markChannelAsRead(userId: string, channelId: string): Promise<void> {
    const userObjectId = new Types.ObjectId(userId);
    const channelObjectId = new Types.ObjectId(channelId);
    await this.channelReadStateModel.findOneAndUpdate(
      { userId: userObjectId, channelId: channelObjectId },
      { $set: { lastReadAt: new Date() } },
      { upsert: true },
    );
  }

  /** Số tin nhắn chưa đọc trong kênh đối với user (tin có createdAt > lastReadAt). */
  async getUnreadCountByChannelId(
    userId: string,
    channelId: string,
  ): Promise<number> {
    const userObjectId = new Types.ObjectId(userId);
    const channelObjectId = new Types.ObjectId(channelId);
    const readState = await this.channelReadStateModel
      .findOne({ userId: userObjectId, channelId: channelObjectId })
      .lean()
      .exec();
    const lastReadAt = readState?.lastReadAt ?? new Date(0);
    return this.messageModel.countDocuments({
      channelId: channelObjectId,
      isDeleted: false,
      createdAt: { $gt: lastReadAt },
      senderId: { $ne: userObjectId }, // không đếm tin mình gửi
    });
  }
}
