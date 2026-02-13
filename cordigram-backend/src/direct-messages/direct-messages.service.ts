import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DirectMessage } from './direct-message.schema';
import {
  CreateDirectMessageDto,
  UpdateDirectMessageDto,
  MarkAsReadDto,
  ReportMessageDto,
} from './dto/create-direct-message.dto';
import { User } from '../users/user.schema';
import { Profile } from '../profiles/profile.schema';
import { Follow } from '../users/follow.schema';
import { MessageReport } from './message-report.schema';

@Injectable()
export class DirectMessagesService {
  constructor(
    @InjectModel(DirectMessage.name)
    private directMessageModel: Model<DirectMessage>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Profile.name) private profileModel: Model<Profile>,
    @InjectModel(Follow.name) private followModel: Model<Follow>,
    @InjectModel(MessageReport.name)
    private messageReportModel: Model<MessageReport>,
  ) {}

  async createDirectMessage(
    senderId: string,
    receiverId: string,
    createDirectMessageDto: CreateDirectMessageDto,
  ): Promise<DirectMessage> {
    const message = new this.directMessageModel({
      senderId: new Types.ObjectId(senderId),
      receiverId: new Types.ObjectId(receiverId),
      content: createDirectMessageDto.content,
      type: createDirectMessageDto.type || 'text',
      giphyId: createDirectMessageDto.giphyId || null,
      voiceUrl: createDirectMessageDto.voiceUrl ?? null,
      voiceDuration: createDirectMessageDto.voiceDuration ?? null,
      attachments: createDirectMessageDto.attachments || [],
      replyTo: createDirectMessageDto.replyTo
        ? new Types.ObjectId(createDirectMessageDto.replyTo)
        : null,
    });

    return message.save();
  }

  async getConversation(
    userId1: string,
    userId2: string,
    limit: number = 50,
    skip: number = 0,
  ): Promise<DirectMessage[]> {
    if (
      !userId1 ||
      !userId2 ||
      userId1 === 'undefined' ||
      userId2 === 'undefined'
    ) {
      return [];
    }

    try {
      const user1 = new Types.ObjectId(userId1);
      const user2 = new Types.ObjectId(userId2);

      const messages = await this.directMessageModel
        .find({
          $or: [
            { senderId: user1, receiverId: user2 },
            { senderId: user2, receiverId: user1 },
          ],
          isDeleted: false,
          deletedFor: { $ne: user1 },
        })
        .populate('senderId', 'email')
        .populate('receiverId', 'email')
        .populate({
          path: 'replyTo',
          populate: [
            { path: 'senderId', select: 'email' },
            { path: 'receiverId', select: 'email' },
          ],
        })
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .lean()
        .exec();

      // Enrich with profile data
      const enrichedMessages = await Promise.all(
        messages.map(async (msg: any) => {
          const senderProfile = await this.profileModel
            .findOne({ userId: msg.senderId._id })
            .select('username displayName avatarUrl')
            .lean()
            .exec();

          const receiverProfile = await this.profileModel
            .findOne({ userId: msg.receiverId._id })
            .select('username displayName avatarUrl')
            .lean()
            .exec();

          return {
            ...msg,
            senderId: {
              _id: msg.senderId._id,
              email: msg.senderId.email,
              username:
                senderProfile?.username ||
                senderProfile?.displayName ||
                msg.senderId.email,
              avatar: senderProfile?.avatarUrl,
            },
            receiverId: {
              _id: msg.receiverId._id,
              email: msg.receiverId.email,
              username:
                receiverProfile?.username ||
                receiverProfile?.displayName ||
                msg.receiverId.email,
              avatar: receiverProfile?.avatarUrl,
            },
          };
        }),
      );

      return enrichedMessages as any;
    } catch (error) {
      console.error('Error getting conversation:', error);
      return [];
    }
  }

  async getDirectMessageById(messageId: string): Promise<DirectMessage> {
    const message: any = await this.directMessageModel
      .findById(messageId)
      .populate('senderId', 'email')
      .populate('receiverId', 'email')
      .lean()
      .exec();

    if (!message) {
      throw new NotFoundException(`Message with id ${messageId} not found`);
    }

    // Enrich with profile data
    const senderProfile = await this.profileModel
      .findOne({ userId: message.senderId._id })
      .select('username displayName avatarUrl')
      .lean()
      .exec();

    const receiverProfile = await this.profileModel
      .findOne({ userId: message.receiverId._id })
      .select('username displayName avatarUrl')
      .lean()
      .exec();

    return {
      ...message,
      senderId: {
        _id: message.senderId._id,
        email: message.senderId.email,
        username:
          senderProfile?.username ||
          senderProfile?.displayName ||
          message.senderId.email,
        avatar: senderProfile?.avatarUrl,
      },
      receiverId: {
        _id: message.receiverId._id,
        email: message.receiverId.email,
        username:
          receiverProfile?.username ||
          receiverProfile?.displayName ||
          message.receiverId.email,
        avatar: receiverProfile?.avatarUrl,
      },
    } as any;
  }

  async updateDirectMessage(
    messageId: string,
    userId: string,
    updateDirectMessageDto: UpdateDirectMessageDto,
  ): Promise<DirectMessage> {
    const message = await this.directMessageModel.findById(messageId);

    if (!message) {
      throw new NotFoundException(`Message with id ${messageId} not found`);
    }

    // Check if user is sender
    if (message.senderId.toString() !== userId) {
      throw new ForbiddenException('You can only edit your own messages');
    }

    if (updateDirectMessageDto.content) {
      message.content = updateDirectMessageDto.content;
      message.isEdited = true;
      message.editedAt = new Date();
    }

    return message.save();
  }

  async deleteDirectMessage(
    messageId: string,
    userId: string,
    deleteType: 'for-everyone' | 'for-me' = 'for-me',
  ): Promise<{ deleteType: string; deletedAt: Date }> {
    const message = await this.directMessageModel.findById(messageId);

    if (!message) {
      throw new NotFoundException(`Message with id ${messageId} not found`);
    }

    const userObjectId = new Types.ObjectId(userId);

    // Check if user is involved in this conversation
    const isInvolved =
      message.senderId.toString() === userId ||
      message.receiverId.toString() === userId;

    if (!isInvolved) {
      throw new ForbiddenException(
        'You can only delete messages in your conversations',
      );
    }

    if (deleteType === 'for-everyone') {
      // Only sender can delete for everyone
      if (message.senderId.toString() !== userId) {
        throw new ForbiddenException(
          'Only the sender can delete message for everyone',
        );
      }

      // Hard delete - mark as deleted for everyone
      message.isDeleted = true;
      await message.save();

      return {
        deleteType: 'for-everyone',
        deletedAt: new Date(),
      };
    } else {
      // Soft delete - only hide for this user
      if (!message.deletedFor.some((id) => id.toString() === userId)) {
        message.deletedFor.push(userObjectId);
        await message.save();
      }

      return {
        deleteType: 'for-me',
        deletedAt: new Date(),
      };
    }
  }

  async markAsRead(messageIds: string[], userId: string): Promise<void> {
    await this.directMessageModel.updateMany(
      {
        _id: { $in: messageIds.map((id) => new Types.ObjectId(id)) },
        receiverId: new Types.ObjectId(userId),
      },
      {
        isRead: true,
        readAt: new Date(),
      },
    );
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.directMessageModel.countDocuments({
      receiverId: new Types.ObjectId(userId),
      isRead: false,
      isDeleted: false,
    });
  }

  async getUnreadCountByUser(
    userId: string,
    fromUserId: string,
  ): Promise<number> {
    return this.directMessageModel.countDocuments({
      receiverId: new Types.ObjectId(userId),
      senderId: new Types.ObjectId(fromUserId),
      isRead: false,
      isDeleted: false,
    });
  }

  async getConversationList(userId: string): Promise<any[]> {
    const user = new Types.ObjectId(userId);

    const conversations = await this.directMessageModel
      .aggregate([
        {
          $match: {
            $or: [{ senderId: user }, { receiverId: user }],
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: {
              conversation: {
                $cond: [
                  { $eq: ['$senderId', user] },
                  '$receiverId',
                  '$senderId',
                ],
              },
            },
            lastMessage: { $last: '$content' },
            lastMessageTime: { $last: '$createdAt' },
            unreadCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$receiverId', user] },
                      { $eq: ['$isRead', false] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
        {
          $sort: { lastMessageTime: -1 },
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id.conversation',
            foreignField: '_id',
            as: 'userInfo',
          },
        },
      ])
      .exec();

    return conversations.map((conv) => ({
      userId: conv._id.conversation,
      username: conv.userInfo[0]?.username || 'Unknown',
      avatar: conv.userInfo[0]?.avatar,
      email: conv.userInfo[0]?.email,
      lastMessage: conv.lastMessage,
      lastMessageTime: conv.lastMessageTime,
      unreadCount: conv.unreadCount,
    }));
  }

  async addReaction(
    messageId: string,
    emoji: string,
    userId: string,
  ): Promise<DirectMessage> {
    const message = await this.directMessageModel.findById(messageId);

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

  async getAvailableUsers(userId: string): Promise<any[]> {
    try {
      const userObjectId = new Types.ObjectId(userId);
      const userIds = new Set<string>();

      // 1. Get list of users that current user is following
      const following = await this.followModel
        .find({ followerId: userObjectId })
        .select('followeeId')
        .lean()
        .exec();

      // Add followee IDs to the set
      following.forEach((f) => {
        userIds.add(f.followeeId.toString());
      });

      // 2. Get list of users who have conversations with current user
      const conversations = await this.directMessageModel
        .find({
          $or: [{ senderId: userObjectId }, { receiverId: userObjectId }],
          isDeleted: false,
        })
        .select('senderId receiverId')
        .lean()
        .exec();

      // Add conversation user IDs to the set
      conversations.forEach((conv) => {
        const otherUserId =
          conv.senderId.toString() === userId
            ? conv.receiverId.toString()
            : conv.senderId.toString();
        userIds.add(otherUserId);
      });

      // If no users to show, return empty array
      if (userIds.size === 0) {
        return [];
      }

      // Convert Set to array of ObjectIds
      const userObjectIds = Array.from(userIds).map(
        (id) => new Types.ObjectId(id),
      );

      // Get profiles of these users
      const profiles = await this.profileModel
        .find({
          userId: { $in: userObjectIds },
        })
        .select('userId username displayName avatarUrl bio')
        .lean()
        .exec();

      return profiles.map((profile) => ({
        _id: profile.userId,
        userId: profile.userId,
        username: profile.username,
        displayName: profile.displayName,
        avatar: profile.avatarUrl,
        avatarUrl: profile.avatarUrl,
        bio: profile.bio,
      }));
    } catch (error) {
      console.error('Error getting available users:', error);
      return [];
    }
  }

  async pinMessage(
    messageId: string,
    userId: string,
  ): Promise<DirectMessage> {
    const message = await this.directMessageModel.findById(messageId);

    if (!message) {
      throw new NotFoundException(`Message with id ${messageId} not found`);
    }

    // Check if user is either sender or receiver
    const userIdObj = new Types.ObjectId(userId);
    if (
      message.senderId.toString() !== userId &&
      message.receiverId.toString() !== userId
    ) {
      throw new ForbiddenException(
        'You can only pin messages in your conversations',
      );
    }

    message.isPinned = !message.isPinned;
    message.pinnedAt = message.isPinned ? new Date() : null;
    message.pinnedBy = message.isPinned ? userIdObj : null;

    return message.save();
  }

  async reportMessage(
    messageId: string,
    userId: string,
    reportDto: ReportMessageDto,
  ): Promise<MessageReport> {
    const message = await this.directMessageModel.findById(messageId);

    if (!message) {
      throw new NotFoundException(`Message with id ${messageId} not found`);
    }

    // Check if user already reported this message
    const existingReport = await this.messageReportModel.findOne({
      messageId: new Types.ObjectId(messageId),
      reporterId: new Types.ObjectId(userId),
    });

    if (existingReport) {
      throw new BadRequestException('You have already reported this message');
    }

    const report = new this.messageReportModel({
      messageId: new Types.ObjectId(messageId),
      reporterId: new Types.ObjectId(userId),
      reason: reportDto.reason,
      description: reportDto.description || null,
    });

    return report.save();
  }

  async getPinnedMessages(
    userId1: string,
    userId2: string,
  ): Promise<DirectMessage[]> {
    try {
      const user1 = new Types.ObjectId(userId1);
      const user2 = new Types.ObjectId(userId2);

      const messages = await this.directMessageModel
        .find({
          $or: [
            { senderId: user1, receiverId: user2 },
            { senderId: user2, receiverId: user1 },
          ],
          isDeleted: false,
          isPinned: true,
        })
        .populate('senderId', 'email')
        .populate('receiverId', 'email')
        .sort({ pinnedAt: -1 })
        .lean()
        .exec();

      // Enrich with profile data
      const enrichedMessages = await Promise.all(
        messages.map(async (msg: any) => {
          const senderProfile = await this.profileModel
            .findOne({ userId: msg.senderId._id })
            .select('username displayName avatarUrl')
            .lean()
            .exec();

          const receiverProfile = await this.profileModel
            .findOne({ userId: msg.receiverId._id })
            .select('username displayName avatarUrl')
            .lean()
            .exec();

          return {
            ...msg,
            senderId: {
              _id: msg.senderId._id,
              email: msg.senderId.email,
              username:
                senderProfile?.username ||
                senderProfile?.displayName ||
                msg.senderId.email,
              avatar: senderProfile?.avatarUrl,
            },
            receiverId: {
              _id: msg.receiverId._id,
              email: msg.receiverId.email,
              username:
                receiverProfile?.username ||
                receiverProfile?.displayName ||
                msg.receiverId.email,
              avatar: receiverProfile?.avatarUrl,
            },
          };
        }),
      );

      return enrichedMessages as any;
    } catch (error) {
      console.error('Error getting pinned messages:', error);
      return [];
    }
  }
}
