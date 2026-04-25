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
import {
  parseMessageSearchQueryForDm,
  type ParsedMessageSearch,
} from '../messages/message-search-query.parser';
import { MessagingProfilesService } from '../messaging-profiles/messaging-profiles.service';

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
    private readonly messagingProfilesService: MessagingProfilesService,
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
      const ignoredObjectIds = Array.from(ignoredSet).map(
        (id) => new Types.ObjectId(id),
      );
      // Keep rows where the current user hid the message "for me" out via
      // `deletedFor`, but still return messages that were unsent for everyone
      // (`isDeleted: true`) so both sides can render the grey placeholder bubble.
      const baseMatch: any = {
        $or: [
          { senderId: user1, receiverId: user2 },
          { senderId: user2, receiverId: user1 },
        ],
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

      // Enrich with messaging profile (tách khỏi hồ sơ social)
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

          const [senderPart, receiverPart] = await Promise.all([
            senderUserId
              ? this.messagingProfilesService.buildDmParticipantPayload(
                  senderUserId,
                  msg.senderId?.email || '',
                )
              : Promise.resolve(null),
            receiverUserId
              ? this.messagingProfilesService.buildDmParticipantPayload(
                  receiverUserId,
                  msg.receiverId?.email || '',
                )
              : Promise.resolve(null),
          ]);

          let enrichedReplyTo: any = null;
          if (msg.replyTo && msg.replyTo.senderId?._id) {
            const rt: any = msg.replyTo;
            const rtSenderUserId = new Types.ObjectId(
              rt.senderId._id.toString(),
            );
            const rtReceiverUserId = new Types.ObjectId(
              rt.receiverId._id.toString(),
            );

            const [rtSenderPart, rtReceiverPart] = await Promise.all([
              this.messagingProfilesService.buildDmParticipantPayload(
                rtSenderUserId,
                rt.senderId.email || '',
              ),
              this.messagingProfilesService.buildDmParticipantPayload(
                rtReceiverUserId,
                rt.receiverId.email || '',
              ),
            ]);

            enrichedReplyTo = {
              _id: rt._id,
              content: rt.content,
              type: rt.type,
              giphyId: rt.giphyId ?? null,
              voiceUrl: rt.voiceUrl ?? null,
              voiceDuration: rt.voiceDuration ?? null,
              createdAt: rt.createdAt,
              senderId: rtSenderPart,
              receiverId: rtReceiverPart,
            };
          }

          return {
            ...msg,
            senderId: senderPart ?? {
              _id: msg.senderId._id,
              email: msg.senderId.email,
              displayName: msg.senderId.email,
              username: msg.senderId.email,
              avatar: undefined,
            },
            receiverId: receiverPart ?? {
              _id: msg.receiverId._id,
              email: msg.receiverId.email,
              displayName: msg.receiverId.email,
              username: msg.receiverId.email,
              avatar: undefined,
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

    const senderUserId = new Types.ObjectId(message.senderId._id.toString());
    const receiverUserId = new Types.ObjectId(
      message.receiverId._id.toString(),
    );

    const [senderPart, receiverPart] = await Promise.all([
      this.messagingProfilesService.buildDmParticipantPayload(
        senderUserId,
        message.senderId.email || '',
      ),
      this.messagingProfilesService.buildDmParticipantPayload(
        receiverUserId,
        message.receiverId.email || '',
      ),
    ]);

    let enrichedReplyTo: any = null;
    if (message.replyTo && message.replyTo.senderId?._id) {
      const rt: any = message.replyTo;
      const rtSenderUserId = new Types.ObjectId(rt.senderId._id.toString());
      const rtReceiverUserId = new Types.ObjectId(rt.receiverId._id.toString());

      const [rtSenderPart, rtReceiverPart] = await Promise.all([
        this.messagingProfilesService.buildDmParticipantPayload(
          rtSenderUserId,
          rt.senderId.email || '',
        ),
        this.messagingProfilesService.buildDmParticipantPayload(
          rtReceiverUserId,
          rt.receiverId.email || '',
        ),
      ]);

      enrichedReplyTo = {
        _id: rt._id,
        content: rt.content,
        type: rt.type,
        giphyId: rt.giphyId ?? null,
        voiceUrl: rt.voiceUrl ?? null,
        voiceDuration: rt.voiceDuration ?? null,
        createdAt: rt.createdAt,
        senderId: rtSenderPart,
        receiverId: rtReceiverPart,
      };
    }

    return {
      ...message,
      senderId: senderPart,
      receiverId: receiverPart,
      replyTo: enrichedReplyTo ?? message.replyTo ?? null,
    };
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
  ): Promise<{
    deleteType: 'for-everyone' | 'for-me';
    deletedAt: Date;
    messageId: string;
    senderId: string;
    receiverId: string;
    isDeletedForEveryone: boolean;
  }> {
    if (!Types.ObjectId.isValid(messageId)) {
      throw new BadRequestException(`Invalid message id: ${messageId}`);
    }

    const message = await this.directMessageModel.findById(messageId);

    if (!message) {
      throw new NotFoundException(`Message with id ${messageId} not found`);
    }

    if (!Types.ObjectId.isValid(userId) || String(userId).length !== 24) {
      throw new BadRequestException('Invalid user id');
    }
    const userObjectId = new Types.ObjectId(userId);
    const senderIdStr = this.participantUserIdString(message.senderId);
    const receiverIdStr = this.participantUserIdString(message.receiverId);

    // Check if user is involved in this conversation
    const isInvolved = senderIdStr === userId || receiverIdStr === userId;

    if (!isInvolved) {
      throw new ForbiddenException(
        'You can only delete messages in your conversations',
      );
    }

    if (deleteType === 'for-everyone') {
      // Only the sender can delete a message for everyone.
      if (senderIdStr !== userId) {
        throw new ForbiddenException(
          'Only the sender can delete message for everyone',
        );
      }

      // Idempotent: if already deleted for everyone, return the existing state
      // instead of throwing, so the client + sockets can safely retry.
      if (message.isDeleted) {
        return {
          deleteType: 'for-everyone',
          deletedAt: message.deletedAt ?? new Date(),
          messageId: message._id.toString(),
          senderId: senderIdStr,
          receiverId: receiverIdStr,
          isDeletedForEveryone: true,
        };
      }

      const deletedAt = new Date();
      // Use the underlying MongoDB collection, not `Model#updateOne`, so
      // Mongoose document validation / `required: content` never runs. That
      // validation is what used to 500 the API when we cleared payload fields.
      // Zero-width content keeps text-index / empty-string edge cases happy;
      // the app renders placeholder text from `isDeleted`, not this string.
      const contentPlaceholder = '\u200b';
      const filter = { _id: message._id };
      const fullRecall = {
        isDeleted: true,
        deletedAt,
        content: contentPlaceholder,
        attachments: [] as string[],
        giphyId: null as string | null,
        voiceUrl: null as string | null,
        voiceDuration: null as number | null,
        reactions: [] as Array<{ userId: Types.ObjectId; emoji: string }>,
      };
      try {
        const r = await this.directMessageModel.collection.updateOne(filter, {
          $set: fullRecall,
        });
        if (!r.acknowledged || r.matchedCount === 0) {
          throw new Error('Mongo update missed the document');
        }
      } catch (_first) {
        // Narrow update: avoids rare driver / validator issues on mixed fields.
        const r2 = await this.directMessageModel.collection.updateOne(filter, {
          $set: {
            isDeleted: true,
            deletedAt,
            content: contentPlaceholder,
          },
        });
        if (!r2.acknowledged || r2.matchedCount === 0) {
          throw new NotFoundException(`Message with id ${messageId} not found`);
        }
      }

      return {
        deleteType: 'for-everyone',
        deletedAt,
        messageId: message._id.toString(),
        senderId: senderIdStr,
        receiverId: receiverIdStr,
        isDeletedForEveryone: true,
      };
    }

    // for-me: add current user to deletedFor (idempotent push via $addToSet).
    // Same as above: use native collection to avoid any Mongoose validation.
    await this.directMessageModel.collection.updateOne(
      { _id: message._id },
      { $addToSet: { deletedFor: userObjectId } },
    );

    return {
      deleteType: 'for-me',
      deletedAt: new Date(),
      messageId: message._id.toString(),
      senderId: senderIdStr,
      receiverId: receiverIdStr,
      isDeletedForEveryone: false,
    };
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

  async markConversationAsRead(
    userId: string,
    fromUserId: string,
  ): Promise<void> {
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

    const rows = conversations.map((conv) => ({
      userId: conv._id.conversation?.toString?.() ?? conv._id.conversation,
      username: conv.userInfo[0]?.username || 'Unknown',
      avatar: conv.userInfo[0]?.avatar,
      email: conv.userInfo[0]?.email,
      lastMessage: conv.lastMessage,
      lastMessageTime: conv.lastMessageTime,
      unreadCount: conv.unreadCount,
    }));

    return Promise.all(
      rows.map(async (row) => {
        if (!row.userId || !Types.ObjectId.isValid(String(row.userId))) {
          return row;
        }
        const part =
          await this.messagingProfilesService.buildDmParticipantPayload(
            new Types.ObjectId(String(row.userId)),
            row.email || '',
          );
        return {
          ...row,
          username: part.displayName,
          avatar: part.avatar,
        };
      }),
    );
  }

  /** Unread DM conversations for inbox, excluding ignored users. Returns displayName and last message. */
  async getUnreadConversations(userId: string): Promise<
    {
      userId: string;
      displayName: string;
      username: string;
      lastMessage: string;
      lastMessageAt: string;
      unreadCount: number;
    }[]
  > {
    const [conversations, ignoredSet] = await Promise.all([
      this.getConversationList(userId),
      this.ignoredService.getIgnoredUserIds(userId),
    ]);
    const withUnread = conversations.filter(
      (c) => (c.unreadCount ?? 0) > 0 && !ignoredSet.has(String(c.userId)),
    );
    const result: {
      userId: string;
      displayName: string;
      username: string;
      lastMessage: string;
      lastMessageAt: string;
      unreadCount: number;
    }[] = [];
    for (const c of withUnread) {
      const otherUserId = new Types.ObjectId(c.userId);
      const part =
        await this.messagingProfilesService.buildDmParticipantPayload(
          otherUserId,
          c.email || '',
        );
      result.push({
        userId: String(c.userId),
        displayName: part.displayName || 'Unknown',
        username: part.username || part.displayName || 'Unknown',
        lastMessage: c.lastMessage ?? '',
        lastMessageAt:
          c.lastMessageTime?.toISOString?.() ?? new Date().toISOString(),
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

      const presenceUsers = await this.userModel
        .find({ _id: { $in: userObjectIds } })
        .select('loginDevices')
        .lean()
        .exec();
      const now = Date.now();
      const devicePresenceAgo = now - 30 * 60 * 1000;
      const onlineById = new Map<string, boolean>();
      for (const u of presenceUsers as Array<{
        _id: Types.ObjectId;
        loginDevices?: Array<{ lastSeenAt?: Date }>;
      }>) {
        let last = 0;
        for (const d of u.loginDevices ?? []) {
          if (d?.lastSeenAt) {
            last = Math.max(last, new Date(d.lastSeenAt).getTime());
          }
        }
        onlineById.set(u._id.toString(), last > 0 && last >= devicePresenceAgo);
      }

      return Promise.all(
        profiles.map(async (profile) => {
          const uid = profile.userId.toString();
          const isOnline = onlineById.get(uid) ?? false;
          const mp =
            await this.messagingProfilesService.ensureMessagingProfile(uid);
          return {
            _id: profile.userId,
            userId: profile.userId,
            username: mp.chatUsername,
            displayName: mp.displayName,
            avatar: mp.avatarUrl,
            avatarUrl: mp.avatarUrl,
            bio: mp.bio || '',
            email: isOnline ? 'Đang hoạt động' : 'Offline',
            isOnline,
          };
        }),
      );
    } catch (error) {
      console.error('Error getting available users:', error);
      return [];
    }
  }

  async pinMessage(messageId: string, userId: string): Promise<DirectMessage> {
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
          const [senderPart, receiverPart] = await Promise.all([
            sid
              ? this.messagingProfilesService.buildDmParticipantPayload(
                  sid,
                  msg.senderId?.email || '',
                )
              : Promise.resolve(null),
            rid
              ? this.messagingProfilesService.buildDmParticipantPayload(
                  rid,
                  msg.receiverId?.email || '',
                )
              : Promise.resolve(null),
          ]);
          return {
            ...msg,
            senderId:
              senderPart ??
              ({
                _id: msg.senderId._id,
                email: msg.senderId.email,
              } as any),
            receiverId:
              receiverPart ??
              ({
                _id: msg.receiverId._id,
                email: msg.receiverId.email,
              } as any),
          };
        }),
      );

      return enrichedMessages as any;
    } catch (error) {
      console.error('Error getting pinned messages:', error);
      return [];
    }
  }

  /** Normalize senderId / receiverId whether stored as ObjectId, string, or populated lean doc. */
  private participantUserIdString(ref: unknown): string {
    if (ref == null) {
      throw new BadRequestException('Message is missing sender or receiver');
    }
    if (typeof ref === 'string') {
      return ref;
    }
    if (ref instanceof Types.ObjectId) {
      return ref.toHexString();
    }
    const asDoc = ref as { _id?: unknown };
    if (asDoc._id != null) {
      return this.participantUserIdString(asDoc._id);
    }
    const maybeToString = (ref as { toString?: () => string }).toString?.();
    if (typeof maybeToString === 'string' && Types.ObjectId.isValid(maybeToString)) {
      return new Types.ObjectId(maybeToString).toHexString();
    }
    throw new BadRequestException('Invalid sender or receiver on message');
  }

  private escapeRegexFragment(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async resolveSenderForDm(
    currentUserId: string,
    otherUserId: string | undefined,
    raw: string,
  ): Promise<Types.ObjectId | undefined> {
    const v = raw.trim();
    let uid: Types.ObjectId | undefined;
    if (Types.ObjectId.isValid(v) && v.length === 24) {
      uid = new Types.ObjectId(v);
    } else {
      const prof = await this.profileModel
        .findOne({
          username: new RegExp(`^${this.escapeRegexFragment(v)}$`, 'i'),
        })
        .select('userId')
        .lean()
        .exec();
      if (!prof?.userId) return undefined;
      uid = new Types.ObjectId(prof.userId.toString());
    }
    const cur = new Types.ObjectId(currentUserId);
    if (otherUserId) {
      const other = new Types.ObjectId(otherUserId);
      if (!uid.equals(cur) && !uid.equals(other)) return undefined;
    }
    return uid;
  }

  async searchDirectMessages(
    currentUserId: string,
    params: {
      q?: string;
      otherUserId?: string;
      before?: string;
      after?: string;
      hasFile?: boolean;
      limit?: number;
      offset?: number;
      fuzzy?: boolean;
      parseQuery?: boolean;
    },
  ): Promise<{ results: any[]; totalCount: number; parsed?: ParsedMessageSearch }> {
    const {
      q,
      otherUserId,
      before,
      after,
      hasFile,
      limit = 25,
      offset = 0,
      fuzzy = false,
      parseQuery = true,
    } = params;
    const uid = new Types.ObjectId(currentUserId);

    const parsed: ParsedMessageSearch =
      parseQuery && q
        ? parseMessageSearchQueryForDm(q)
        : { text: (q || '').trim(), filters: {} };

    const match: any = {
      isDeleted: false,
      $or: [{ senderId: uid }, { receiverId: uid }],
    };

    if (otherUserId) {
      const otherId = new Types.ObjectId(otherUserId);
      match.$or = [
        { senderId: uid, receiverId: otherId },
        { senderId: otherId, receiverId: uid },
      ];
    }

    if (parsed.filters.from) {
      const sid = await this.resolveSenderForDm(
        currentUserId,
        otherUserId,
        parsed.filters.from,
      );
      if (!sid) {
        return { results: [], totalCount: 0, parsed };
      }
      const baseOr = match.$or;
      match.$and = [{ $or: baseOr }, { senderId: sid }];
      delete match.$or;
    }

    const text = parsed.text.trim();

    const hasImageFilter = parsed.filters.has === 'image';
    const hasFileFilter = Boolean(hasFile) || parsed.filters.has === 'file';

    if (hasImageFilter) {
      match.$and = match.$and || [];
      match.$and.push({
        $or: [
          { giphyId: { $ne: null } },
          {
            attachments: {
              $elemMatch: {
                $regex: /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i,
              },
            },
          },
        ],
      });
    } else if (hasFileFilter) {
      match['attachments.0'] = { $exists: true };
    }

    if (before) {
      match.createdAt = { ...(match.createdAt || {}), $lt: new Date(before) };
    }
    if (after) {
      match.createdAt = { ...(match.createdAt || {}), $gt: new Date(after) };
    }

    const runQuery = async (contentExtra: Record<string, unknown>) => {
      const full = { ...match, ...contentExtra };
      const [totalCount, messages] = await Promise.all([
        this.directMessageModel.countDocuments(full),
        this.directMessageModel
          .find(full)
          .populate('senderId', 'email')
          .populate('receiverId', 'email')
          .sort(
            text && '$text' in contentExtra
              ? { score: { $meta: 'textScore' }, createdAt: -1 }
              : { createdAt: -1 },
          )
          .skip(offset)
          .limit(limit)
          .lean()
          .exec(),
      ]);
      return { totalCount, messages };
    };

    let contentExtra: Record<string, unknown> = {};
    if (text) {
      try {
        await this.directMessageModel.countDocuments({
          ...match,
          $text: { $search: text },
        });
        contentExtra = { $text: { $search: text } };
      } catch {
        const escaped = this.escapeRegexFragment(text);
        contentExtra = { content: { $regex: escaped, $options: 'i' } };
      }
    }

    let { totalCount, messages } = await runQuery(contentExtra);

    if (fuzzy && totalCount === 0 && text && !('$text' in contentExtra)) {
      const words = text.split(/\s+/).filter((w) => w.length > 0);
      if (words.length > 1) {
        const pattern = words.map((w) => this.escapeRegexFragment(w)).join('.*');
        contentExtra = { content: { $regex: pattern, $options: 'i' } };
        const retry = await runQuery(contentExtra);
        totalCount = retry.totalCount;
        messages = retry.messages;
      }
    }

    if (fuzzy && totalCount === 0 && text && '$text' in contentExtra) {
      const escaped = this.escapeRegexFragment(text);
      contentExtra = { content: { $regex: escaped, $options: 'i' } };
      const retry = await runQuery(contentExtra);
      totalCount = retry.totalCount;
      messages = retry.messages;
    }

    const results = await Promise.all(
      messages.map(async (msg: any) => {
        const sId = msg.senderId?._id ?? msg.senderId;
        const rId = msg.receiverId?._id ?? msg.receiverId;

        const [senderPart, receiverPart] = await Promise.all([
          sId
            ? this.messagingProfilesService.buildDmParticipantPayload(
                new Types.ObjectId(sId.toString()),
                typeof msg.senderId === 'object'
                  ? msg.senderId?.email || ''
                  : '',
              )
            : Promise.resolve(null),
          rId
            ? this.messagingProfilesService.buildDmParticipantPayload(
                new Types.ObjectId(rId.toString()),
                typeof msg.receiverId === 'object'
                  ? msg.receiverId?.email || ''
                  : '',
              )
            : Promise.resolve(null),
        ]);

        return {
          ...msg,
          senderId: senderPart
            ? {
                ...(typeof msg.senderId === 'object'
                  ? msg.senderId
                  : { _id: msg.senderId, email: '' }),
                displayName: senderPart.displayName,
                username: senderPart.username,
                avatarUrl: senderPart.avatar,
              }
            : msg.senderId,
          receiverId: receiverPart
            ? {
                ...(typeof msg.receiverId === 'object'
                  ? msg.receiverId
                  : { _id: msg.receiverId, email: '' }),
                displayName: receiverPart.displayName,
                username: receiverPart.username,
                avatarUrl: receiverPart.avatar,
              }
            : msg.receiverId,
        };
      }),
    );

    return { results, totalCount, parsed };
  }
}
