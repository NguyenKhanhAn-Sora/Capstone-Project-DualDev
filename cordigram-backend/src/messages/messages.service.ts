import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message } from './message.schema';
import { Channel } from '../channels/channel.schema';
import { Profile } from '../profiles/profile.schema';
import { Server } from '../servers/server.schema';
import { ChannelReadState } from './channel-read-state.schema';
import { CreateMessageDto } from './dto/create-message.dto';
import { IgnoredService } from '../users/ignored.service';
import { RolesService } from '../roles/roles.service';
import { InboxSeen } from '../inbox/inbox-seen.schema';
import { UserServer } from '../access/user-server.schema';

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<Message>,
    @InjectModel(Channel.name) private channelModel: Model<Channel>,
    @InjectModel(Profile.name) private profileModel: Model<Profile>,
    @InjectModel(Server.name) private serverModel: Model<Server>,
    @InjectModel(ChannelReadState.name)
    private channelReadStateModel: Model<ChannelReadState>,
    @InjectModel(UserServer.name) private userServerModel: Model<UserServer>,
    @InjectModel(InboxSeen.name) private inboxSeenModel: Model<InboxSeen>,
    private readonly ignoredService: IgnoredService,
    @Inject(forwardRef(() => RolesService))
    private readonly rolesService: RolesService,
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

    // Access Control đơn giản: chỉ cần là thành viên server là được chat.
    // (Mặc định mọi server cho phép gửi tin nhắn, GIF, emoji, sticker, voice, upload ảnh.)
    const server = await this.serverModel
      .findById(channel.serverId)
      .select('ownerId members')
      .lean()
      .exec();
    if (!server) throw new NotFoundException('Server not found');

    const isOwner =
      (server as any).ownerId?.toString?.() === userId ||
      (server as any).ownerId?.toString?.() === userObjectId.toString();

    const isMember =
      isOwner ||
      Array.isArray((server as any).members) &&
        (server as any).members.some(
          (m: any) => (m?.userId?._id ?? m?.userId)?.toString() === userId,
        );

    if (!isMember) {
      throw new ForbiddenException('Bạn không thuộc server này');
    }

    const canResolveMentions = await this.rolesService.hasPermission(
      channel.serverId.toString(),
      userId,
      'mentionEveryone',
    );
    const mentionIds = canResolveMentions
      ? await this.resolveMentions(
          channel.serverId.toString(),
          userId,
          createMessageDto.content,
          createMessageDto.mentions,
        )
      : [];

    const message = new this.messageModel({
      channelId: new Types.ObjectId(channelId),
      senderId: userObjectId,
      content: createMessageDto.content,
      attachments: createMessageDto.attachments || [],
      replyTo: createMessageDto.replyTo
        ? new Types.ObjectId(createMessageDto.replyTo)
        : null,
      mentions: mentionIds.map((id) => new Types.ObjectId(id)),
      messageType: createMessageDto.messageType || 'text',
      giphyId: createMessageDto.giphyId || null,
    });

    const savedMessage = await message.save();

    channel.messageCount = (channel.messageCount || 0) + 1;
    await channel.save();

    const enriched = await this.getMessageByIdEnriched(savedMessage._id.toString());
    return enriched as any;
  }

  async createWaveStickerMessage(
    channelId: string,
    userId: string,
    replyTo?: string,
    giphyId?: string,
  ): Promise<Message> {
    const channel = await this.channelModel.findById(channelId);
    if (!channel) {
      throw new NotFoundException(`Channel with id ${channelId} not found`);
    }

    const message = new this.messageModel({
      channelId: new Types.ObjectId(channelId),
      senderId: new Types.ObjectId(userId),
      content: 'Vẫy tay chào!',
      messageType: 'sticker',
      giphyId: giphyId || null,
      attachments: [],
      replyTo: replyTo ? new Types.ObjectId(replyTo) : null,
      mentions: [],
    });

    const saved = await message.save();

    channel.messageCount = (channel.messageCount || 0) + 1;
    await channel.save();

    const enriched = await this.getMessageByIdEnriched(saved._id.toString());
    return enriched as any;
  }

  /**
   * Gộp explicit IDs + @everyone/@here + @vai trò + @username trong nội dung.
   * Mỗi user được đề cập có ObjectId trong message.mentions → tab Hộp thư "Đề cập".
   */
  private async resolveMentions(
    serverId: string,
    senderId: string,
    content: string,
    explicitMentionIds?: string[],
  ): Promise<string[]> {
    const mentionSet = new Set<string>();

    if (explicitMentionIds?.length) {
      for (const id of explicitMentionIds) {
        if (id !== senderId) mentionSet.add(id);
      }
    }

    const server = await this.serverModel
      .findById(serverId)
      .select('members')
      .lean()
      .exec();
    if (!server) return Array.from(mentionSet);

    const memberUserIds = server.members.map((m) => m.userId.toString());
    const allExceptSender = memberUserIds.filter((id) => id !== senderId);

    if (/@everyone\b/i.test(content)) {
      for (const id of allExceptSender) mentionSet.add(id);
    }
    if (/@here\b/i.test(content)) {
      for (const id of allExceptSender) mentionSet.add(id);
    }

    const roles = await this.rolesService.getRolesByServer(serverId);
    for (const role of roles) {
      if (role.isDefault) continue;
      const escaped = role.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`@${escaped}(?:\\s|$|[\\n\\r.,!?])`, 'i').test(content)) {
        for (const uid of role.memberIds ?? []) {
          const sid = uid.toString();
          if (sid !== senderId && memberUserIds.includes(sid)) {
            mentionSet.add(sid);
          }
        }
      }
    }

    const mentionPattern = /@([^\s@]+)/g;
    const usernames: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = mentionPattern.exec(content)) !== null) {
      const token = match[1].toLowerCase();
      if (token === 'everyone' || token === 'here') continue;
      usernames.push(token);
    }

    if (usernames.length > 0) {
      const profiles = await this.profileModel
        .find({
          userId: { $in: memberUserIds.map((id) => new Types.ObjectId(id)) },
          $or: [
            { username: { $in: usernames } },
            {
              username: {
                $in: usernames.map((u) => new RegExp(`^${u}$`, 'i')),
              },
            },
          ],
        })
        .select('userId username')
        .lean()
        .exec();

      for (const profile of profiles) {
        const uid = profile.userId.toString();
        if (uid !== senderId) mentionSet.add(uid);
      }
    }

    return Array.from(mentionSet);
  }

  /**
   * Get notification context for a channel message: server info, notification level,
   * member list, and resolved mentions.
   */
  async getMessageNotificationContext(
    channelId: string,
    senderId: string,
    mentionIds: string[],
  ): Promise<{
    serverId: string;
    serverName: string;
    channelName: string;
    defaultNotificationLevel: 'all' | 'mentions';
    memberUserIds: string[];
    mentionedUserIds: string[];
  } | null> {
    const channel = await this.channelModel.findById(channelId).lean().exec();
    if (!channel) return null;

    const server = await this.serverModel
      .findById(channel.serverId)
      .select('name members interactionSettings')
      .lean()
      .exec();
    if (!server) return null;

    const level =
      (server as any).interactionSettings?.defaultNotificationLevel === 'mentions'
        ? 'mentions'
        : 'all';

    const memberUserIds = (server as any).members
      .map((m: any) => m.userId.toString())
      .filter((uid: string) => uid !== senderId);

    return {
      serverId: (server as any)._id.toString(),
      serverName: (server as any).name,
      channelName: channel.name,
      defaultNotificationLevel: level,
      memberUserIds,
      mentionedUserIds: mentionIds,
    };
  }

  /**
   * Get channel mentions for a user (for the Inbox "Đề cập" tab).
   */
  async getChannelMentionsForUser(
    userId: string,
    limit = 50,
  ): Promise<
    Array<{
      id: string;
      channelId: string;
      channelName: string;
      serverId: string;
      serverName: string;
      messageId: string;
      actorName: string;
      excerpt: string;
      createdAt: string;
    }>
  > {
    const userObjectId = new Types.ObjectId(userId);
    const messages = await this.messageModel
      .find({ mentions: userObjectId, isDeleted: false })
      .populate('channelId', 'name type serverId')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    if (messages.length === 0) return [];

    const serverIds = [
      ...new Set(
        messages
          .map((m: any) => {
            const ch = m.channelId;
            if (!ch || typeof ch !== 'object') return null;
            return ch.serverId != null ? String(ch.serverId) : null;
          })
          .filter(Boolean) as string[],
      ),
    ];
    const servers = await this.serverModel
      .find({ _id: { $in: serverIds.map((id) => new Types.ObjectId(id)) } })
      .select('name')
      .lean()
      .exec();
    const serverMap = new Map<string, string>(
      servers.map((s: any) => [String(s._id), s.name]),
    );

    const senderIds = [
      ...new Set(messages.map((m: any) => m.senderId.toString())),
    ];
    const profiles = await this.profileModel
      .find({
        userId: { $in: senderIds.map((id) => new Types.ObjectId(id)) },
      })
      .select('userId displayName username')
      .lean()
      .exec();
    const profileMap = new Map(
      profiles.map((p: any) => [
        p.userId.toString(),
        p.displayName || p.username || 'Ai đó',
      ]),
    );

    return messages.map((msg: any) => {
      const ch = msg.channelId as any;
      const rawSid = ch?.serverId;
      const serverId = rawSid != null ? String(rawSid) : '';
      return {
        id: msg._id.toString(),
        channelId: ch?._id?.toString() ?? '',
        channelName: ch?.name ?? 'general',
        serverId,
        serverName: (serverId && serverMap.get(serverId)) || 'Máy chủ',
        messageId: msg._id.toString(),
        actorName: profileMap.get(msg.senderId.toString()) ?? 'Ai đó',
        excerpt: (msg.content ?? '').slice(0, 200),
        createdAt:
          msg.createdAt?.toISOString?.() ?? new Date().toISOString(),
      };
    });
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

    // Access Control: nếu có viewerId thì chỉ cho xem khi viewer thuộc server.
    if (viewerId) {
      const channel = await this.channelModel
        .findById(channelId)
        .select('serverId')
        .lean()
        .exec();
      if (!channel) throw new NotFoundException('Channel not found');

      const viewerOid = new Types.ObjectId(viewerId);
      const isMember = await this.serverModel.exists({
        _id: channel.serverId,
        $or: [{ ownerId: viewerOid }, { 'members.userId': viewerOid }],
      });

      if (!isMember) throw new ForbiddenException('Bạn không thuộc server này');
    }

    if (viewerId) {
      const ignoredSet = await this.ignoredService.getIgnoredUserIds(viewerId);
      if (ignoredSet.size > 0) {
        const viewerOid = new Types.ObjectId(viewerId);
        const ignoredIds = Array.from(ignoredSet).map(
          (id) => new Types.ObjectId(id),
        );
        match.$or = [
          { senderId: { $nin: ignoredIds } },
          { mentions: viewerOid },
        ];
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

    const hasWelcome = enriched.some((m: any) => m.messageType === 'welcome');
    if (hasWelcome) {
      const channel = await this.channelModel
        .findById(channelId)
        .select('serverId')
        .lean()
        .exec();
      if (channel) {
        const server = await this.serverModel
          .findById(channel.serverId)
          .select('interactionSettings')
          .lean()
          .exec();
        const stickerReply =
          (server as any)?.interactionSettings?.stickerReplyWelcomeEnabled ?? true;
        for (const m of enriched) {
          if ((m as any).messageType === 'welcome') {
            (m as any).stickerReplyWelcomeEnabled = stickerReply;
          }
        }
      }
    }

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
    const now = new Date();
    await this.channelReadStateModel.findOneAndUpdate(
      { userId: userObjectId, channelId: channelObjectId },
      { $set: { lastReadAt: now } },
      { upsert: true },
    );

    const mentionMsgs = await this.messageModel
      .find({
        channelId: channelObjectId,
        isDeleted: false,
        mentions: userObjectId,
        createdAt: { $lte: now },
      })
      .select('_id')
      .lean()
      .exec();

    if (mentionMsgs.length > 0) {
      await this.inboxSeenModel.bulkWrite(
        mentionMsgs.map((m: { _id: Types.ObjectId }) => ({
          updateOne: {
            filter: {
              userId: userObjectId,
              sourceType: 'channel_mention',
              sourceId: m._id.toString(),
            },
            update: { $set: { seenAt: now } },
            upsert: true,
          },
        })),
      );
    }
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
      senderId: { $ne: userObjectId },
    });
  }

  async searchMessages(params: {
    serverId?: string;
    channelId?: string;
    q?: string;
    senderId?: string;
    before?: string;
    after?: string;
    hasFile?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ results: any[]; totalCount: number }> {
    const {
      serverId,
      channelId,
      q,
      senderId,
      before,
      after,
      hasFile,
      limit = 25,
      offset = 0,
    } = params;

    const match: any = { isDeleted: false };

    if (channelId) {
      match.channelId = new Types.ObjectId(channelId);
    } else if (serverId) {
      const channels = await this.channelModel
        .find({ serverId: new Types.ObjectId(serverId) })
        .select('_id')
        .lean()
        .exec();
      const channelIds = channels.map((c) => c._id);
      if (channelIds.length === 0) return { results: [], totalCount: 0 };
      match.channelId = { $in: channelIds };
    }

    if (q && q.trim()) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      match.content = { $regex: escaped, $options: 'i' };
    }

    if (senderId) {
      match.senderId = new Types.ObjectId(senderId);
    }

    if (before) {
      match.createdAt = { ...(match.createdAt || {}), $lt: new Date(before) };
    }
    if (after) {
      match.createdAt = { ...(match.createdAt || {}), $gt: new Date(after) };
    }

    if (hasFile) {
      match['attachments.0'] = { $exists: true };
    }

    const [totalCount, messages] = await Promise.all([
      this.messageModel.countDocuments(match),
      this.messageModel
        .find(match)
        .populate('senderId', 'email')
        .populate('channelId', 'name type serverId')
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean()
        .exec(),
    ]);

    const results = await Promise.all(
      messages.map(async (msg: any) => {
        const sid = msg.senderId?._id ?? msg.senderId;
        const senderUserId =
          sid != null ? new Types.ObjectId(sid.toString()) : null;
        const senderProfile = senderUserId
          ? await this.profileModel
              .findOne({ userId: senderUserId })
              .select('username displayName avatarUrl')
              .lean()
              .exec()
          : null;

        return {
          ...msg,
          senderId: {
            ...(typeof msg.senderId === 'object'
              ? msg.senderId
              : { _id: msg.senderId, email: '' }),
            displayName: senderProfile?.displayName ?? undefined,
            username: senderProfile?.username ?? undefined,
            avatarUrl: senderProfile?.avatarUrl ?? undefined,
          },
        };
      }),
    );

    return { results, totalCount };
  }
}
