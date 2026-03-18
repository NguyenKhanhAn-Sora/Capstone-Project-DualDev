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
import { IgnoredService } from '../users/ignored.service';

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
    private readonly ignoredService: IgnoredService,
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

      const ignoredSet = await this.ignoredService.getIgnoredUserIds(userId1);
      const ignoredObjectIds = Array.from(ignoredSet).map((id) => new Types.ObjectId(id));
      const baseMatch: any = {
        $or: [
          { senderId: user1, receiverId: user2 },
          { senderId: user2, receiverId: user1 },
        ],
        isDeleted: false,
        deletedFor: { $ne: user1 },
      };
      if (ignoredObjectIds.length > 0) {
        baseMatch.senderId = { $nin: ignoredObjectIds };
      }

      const messages = await this.directMessageModel
        .find(baseMatch)
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

      // Enrich with profile data (userId as ObjectId for reliable Profile lookup)
      const enrichedMessages = await Promise.all(
        messages.map(async (msg: any) => {
          const senderUserId =
            msg.senderId?._id != null
              ? new Types.ObjectId(msg.senderId._id.toString())
              : null;
          const receiverUserId =
            msg.receiverId?._id != null
              ? new Types.ObjectId(msg.receiverId._id.toString())
              : null;

          const senderProfile = senderUserId
            ? await this.profileModel
                .findOne({ userId: senderUserId })
                .select('username displayName avatarUrl')
                .lean()
                .exec()
            : null;
          const receiverProfile = receiverUserId
            ? await this.profileModel
                .findOne({ userId: receiverUserId })
                .select('username displayName avatarUrl')
                .lean()
                .exec()
            : null;

          const senderDisplay =
            senderProfile?.displayName ||
            senderProfile?.username ||
            msg.senderId?.email ||
            '';
          const receiverDisplay =
            receiverProfile?.displayName ||
            receiverProfile?.username ||
            msg.receiverId?.email ||
            '';

          // Enrich replyTo (if populated) with Profile.displayName
          let enrichedReplyTo: any = null;
          if (msg.replyTo && (msg.replyTo as any).senderId?._id) {
            const rt: any = msg.replyTo;
            const rtSenderUserId = new Types.ObjectId(rt.senderId._id.toString());
            const rtReceiverUserId = new Types.ObjectId(rt.receiverId._id.toString());

            const rtSenderProfile = await this.profileModel
              .findOne({ userId: rtSenderUserId })
              .select('username displayName avatarUrl')
              .lean()
              .exec();
            const rtReceiverProfile = await this.profileModel
              .findOne({ userId: rtReceiverUserId })
              .select('username displayName avatarUrl')
              .lean()
              .exec();

            const rtSenderDisplay =
              rtSenderProfile?.displayName ||
              rtSenderProfile?.username ||
              rt.senderId.email ||
              '';
            const rtReceiverDisplay =
              rtReceiverProfile?.displayName ||
              rtReceiverProfile?.username ||
              rt.receiverId.email ||
              '';

            enrichedReplyTo = {
              _id: rt._id,
              content: rt.content,
              type: rt.type,
              giphyId: rt.giphyId ?? null,
              voiceUrl: rt.voiceUrl ?? null,
              voiceDuration: rt.voiceDuration ?? null,
              createdAt: rt.createdAt,
              senderId: {
                _id: rt.senderId._id,
                email: rt.senderId.email,
                username: rtSenderDisplay,
                displayName: rtSenderProfile?.displayName ?? rtSenderDisplay,
                avatar: rtSenderProfile?.avatarUrl,
              },
              receiverId: {
                _id: rt.receiverId._id,
                email: rt.receiverId.email,
                username: rtReceiverDisplay,
                displayName: rtReceiverProfile?.displayName ?? rtReceiverDisplay,
                avatar: rtReceiverProfile?.avatarUrl,
              },
            };
          }

          return {
            ...msg,
            senderId: {
              _id: msg.senderId._id,
              email: msg.senderId.email,
              username: senderDisplay,
              displayName: senderProfile?.displayName ?? senderDisplay,
              avatar: senderProfile?.avatarUrl,
            },
            receiverId: {
              _id: msg.receiverId._id,
              email: msg.receiverId.email,
              username: receiverDisplay,
              displayName: receiverProfile?.displayName ?? receiverDisplay,
              avatar: receiverProfile?.avatarUrl,
            },
            replyTo: enrichedReplyTo ?? msg.replyTo ?? null,
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
      .populate({
        path: 'replyTo',
        populate: [
          { path: 'senderId', select: 'email' },
          { path: 'receiverId', select: 'email' },
        ],
      })
      .lean()
      .exec();

    if (!message) {
      throw new NotFoundException(`Message with id ${messageId} not found`);
    }

    // Enrich with profile data
    const senderUserId = new Types.ObjectId(message.senderId._id.toString());
    const receiverUserId = new Types.ObjectId(message.receiverId._id.toString());

    const senderProfile = await this.profileModel
      .findOne({ userId: senderUserId })
      .select('username displayName avatarUrl')
      .lean()
      .exec();

    const receiverProfile = await this.profileModel
      .findOne({ userId: receiverUserId })
      .select('username displayName avatarUrl')
      .lean()
      .exec();

    const senderDisplay =
      senderProfile?.displayName ||
      senderProfile?.username ||
      message.senderId.email ||
      '';
    const receiverDisplay =
      receiverProfile?.displayName ||
      receiverProfile?.username ||
      message.receiverId.email ||
      '';

    // Enrich replyTo (if any) with Profile.displayName
    let enrichedReplyTo: any = null;
    if (message.replyTo && (message.replyTo as any).senderId?._id) {
      const rt: any = message.replyTo;
      const rtSenderUserId = new Types.ObjectId(rt.senderId._id.toString());
      const rtReceiverUserId = new Types.ObjectId(rt.receiverId._id.toString());

      const rtSenderProfile = await this.profileModel
        .findOne({ userId: rtSenderUserId })
        .select('username displayName avatarUrl')
        .lean()
        .exec();
      const rtReceiverProfile = await this.profileModel
        .findOne({ userId: rtReceiverUserId })
        .select('username displayName avatarUrl')
        .lean()
        .exec();

      const rtSenderDisplay =
        rtSenderProfile?.displayName ||
        rtSenderProfile?.username ||
        rt.senderId.email ||
        '';
      const rtReceiverDisplay =
        rtReceiverProfile?.displayName ||
        rtReceiverProfile?.username ||
        rt.receiverId.email ||
        '';

      enrichedReplyTo = {
        _id: rt._id,
        content: rt.content,
        type: rt.type,
        giphyId: rt.giphyId ?? null,
        voiceUrl: rt.voiceUrl ?? null,
        voiceDuration: rt.voiceDuration ?? null,
        createdAt: rt.createdAt,
        senderId: {
          _id: rt.senderId._id,
          email: rt.senderId.email,
          username: rtSenderDisplay,
          displayName: rtSenderProfile?.displayName ?? rtSenderDisplay,
          avatar: rtSenderProfile?.avatarUrl,
        },
        receiverId: {
          _id: rt.receiverId._id,
          email: rt.receiverId.email,
          username: rtReceiverDisplay,
          displayName: rtReceiverProfile?.displayName ?? rtReceiverDisplay,
          avatar: rtReceiverProfile?.avatarUrl,
        },
      };
    }

    return {
      ...message,
      senderId: {
        _id: message.senderId._id,
        email: message.senderId.email,
        username: senderDisplay,
        displayName: senderProfile?.displayName ?? senderDisplay,
        avatar: senderProfile?.avatarUrl,
      },
      receiverId: {
        _id: message.receiverId._id,
        email: message.receiverId.email,
        username: receiverDisplay,
        displayName: receiverProfile?.displayName ?? receiverDisplay,
        avatar: receiverProfile?.avatarUrl,
      },
      replyTo: enrichedReplyTo ?? message.replyTo ?? null,
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

  async markConversationAsRead(userId: string, fromUserId: string): Promise<void> {
    await this.directMessageModel.updateMany(
      {
        receiverId: new Types.ObjectId(userId),
        senderId: new Types.ObjectId(fromUserId),
        isRead: false,
        isDeleted: false,
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
      userId: conv._id.conversation?.toString?.() ?? conv._id.conversation,
      username: conv.userInfo[0]?.username || 'Unknown',
      avatar: conv.userInfo[0]?.avatar,
      email: conv.userInfo[0]?.email,
      lastMessage: conv.lastMessage,
      lastMessageTime: conv.lastMessageTime,
      unreadCount: conv.unreadCount,
    }));
  }

  /** Unread DM conversations for inbox, excluding ignored users. Returns displayName and last message. */
  async getUnreadConversations(userId: string): Promise<
    { userId: string; displayName: string; username: string; lastMessage: string; lastMessageAt: string; unreadCount: number }[]
  > {
    const [conversations, ignoredSet] = await Promise.all([
      this.getConversationList(userId),
      this.ignoredService.getIgnoredUserIds(userId),
    ]);
    const withUnread = conversations.filter(
      (c) => (c.unreadCount ?? 0) > 0 && !ignoredSet.has(String(c.userId)),
    );
    const result: { userId: string; displayName: string; username: string; lastMessage: string; lastMessageAt: string; unreadCount: number }[] = [];
    for (const c of withUnread) {
      const otherUserId = new Types.ObjectId(c.userId);
      const profile = await this.profileModel
        .findOne({ userId: otherUserId })
        .select('displayName username avatarUrl')
        .lean()
        .exec();
      const displayName = (profile as any)?.displayName || (profile as any)?.username || c.username || 'Unknown';
      result.push({
        userId: String(c.userId),
        displayName,
        username: c.username || 'Unknown',
        lastMessage: c.lastMessage ?? '',
        lastMessageAt: c.lastMessageTime?.toISOString?.() ?? new Date().toISOString(),
        unreadCount: c.unreadCount ?? 0,
      });
    }
    return result;
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

      // Enrich with profile data (same as getConversation)
      const enrichedMessages = await Promise.all(
        messages.map(async (msg: any) => {
          const sid =
            msg.senderId?._id != null
              ? new Types.ObjectId(msg.senderId._id.toString())
              : null;
          const rid =
            msg.receiverId?._id != null
              ? new Types.ObjectId(msg.receiverId._id.toString())
              : null;
          const senderProfile = sid
            ? await this.profileModel
                .findOne({ userId: sid })
                .select('username displayName avatarUrl')
                .lean()
                .exec()
            : null;
          const receiverProfile = rid
            ? await this.profileModel
                .findOne({ userId: rid })
                .select('username displayName avatarUrl')
                .lean()
                .exec()
            : null;
          const senderDisplay =
            senderProfile?.displayName ||
            senderProfile?.username ||
            msg.senderId?.email ||
            '';
          const receiverDisplay =
            receiverProfile?.displayName ||
            receiverProfile?.username ||
            msg.receiverId?.email ||
            '';
          return {
            ...msg,
            senderId: {
              _id: msg.senderId._id,
              email: msg.senderId.email,
              username: senderDisplay,
              displayName: senderProfile?.displayName ?? senderDisplay,
              avatar: senderProfile?.avatarUrl,
            },
            receiverId: {
              _id: msg.receiverId._id,
              email: msg.receiverId.email,
              username: receiverDisplay,
              displayName: receiverProfile?.displayName ?? receiverDisplay,
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