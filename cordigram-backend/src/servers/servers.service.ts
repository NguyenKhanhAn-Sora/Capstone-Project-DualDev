import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Server } from './server.schema';
import { Channel } from '../channels/channel.schema';
import { ChannelCategory } from '../channels/channel-category.schema';
import { CreateServerDto } from './dto/create-server.dto';
import { UpdateServerDto } from './dto/update-server.dto';
import { User } from '../users/user.schema';
import { Profile } from '../profiles/profile.schema';
import { ServerInvite } from '../server-invites/server-invite.schema';
import { RolesService } from '../roles/roles.service';
import { ServerNotification } from './server-notification.schema';
import { Message } from '../messages/message.schema';
import { ChannelReadState } from '../messages/channel-read-state.schema';
import { UserServer } from '../access/user-server.schema';
import { ChannelMessagesGateway } from '../messages/channel-messages.gateway';
import { ServerAccessService } from '../access/server-access.service';
import { RolePermissions } from '../roles/role.schema';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AddServerEmojiDto } from './dto/add-server-emoji.dto';
import { BoostService } from '../boost/boost.service';

/** Tổng số emoji tùy chỉnh (tĩnh + GIF) tối đa mỗi máy chủ. */
const MAX_CUSTOM_EMOJIS_PER_SERVER = 30;
/** Sticker máy chủ — tầng nâng cấp (boost) sẽ mở rộng sau; hiện chỉ dùng tầng miễn phí. */
const MAX_CUSTOM_STICKERS_PER_SERVER = 5;

@Injectable()
export class ServersService {
  constructor(
    @InjectModel(Server.name) private serverModel: Model<Server>,
    @InjectModel(Channel.name) private channelModel: Model<Channel>,
    @InjectModel(ChannelCategory.name)
    private channelCategoryModel: Model<ChannelCategory>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Profile.name) private profileModel: Model<Profile>,
    @InjectModel(ServerInvite.name)
    private serverInviteModel: Model<ServerInvite>,
    @InjectModel(ServerNotification.name)
    private serverNotificationModel: Model<ServerNotification>,
    @InjectModel(Message.name) private messageModel: Model<Message>,
    @InjectModel(ChannelReadState.name)
    private channelReadStateModel: Model<ChannelReadState>,
    @InjectModel(UserServer.name) private userServerModel: Model<UserServer>,
    @Inject(forwardRef(() => RolesService))
    private rolesService: RolesService,
    private readonly channelMessagesGateway: ChannelMessagesGateway,
    @Inject(forwardRef(() => ServerAccessService))
    private readonly serverAccessService: ServerAccessService,
    private readonly auditLogService: AuditLogService,
    @Inject(forwardRef(() => BoostService))
    private readonly boostService: BoostService,
  ) {}

  /** Internal helper: create notification for specific users (no permission checks). */
  async createUserNotification(params: {
    serverId: string;
    actorId: string;
    recipientUserIds: string[];
    title: string;
    content: string;
  }): Promise<{ notificationId: string; recipients: number }> {
    const title = params.title?.trim?.() ?? '';
    const content = params.content?.trim?.() ?? '';
    if (!title || !content) {
      throw new BadRequestException('title và content là bắt buộc');
    }
    const uniqueRecipientIds = Array.from(new Set(params.recipientUserIds))
      .filter(Boolean)
      .map((id) => new Types.ObjectId(id));
    if (uniqueRecipientIds.length === 0) {
      return { notificationId: '', recipients: 0 };
    }
    const notification = await this.serverNotificationModel.create({
      serverId: new Types.ObjectId(params.serverId),
      createdBy: new Types.ObjectId(params.actorId),
      title,
      content,
      targetType: 'everyone',
      targetRoleId: null,
      targetRoleName: null,
      recipientUserIds: uniqueRecipientIds,
    });
    return {
      notificationId: notification._id.toString(),
      recipients: uniqueRecipientIds.length,
    };
  }

  /**
   * Prune (bulk kick) members who are inactive for N days.
   *
   * "Last active" is derived from the latest login device `lastSeenAt` (if present).
   * If a user has no loginDevices tracked yet, we fall back to `createdAt`.
   *
   * Notes:
   * - Owner is never pruned.
   * - `roleFilter` matches the server member role (owner/moderator/member).
   */
  private async resolvePrunableMemberIds(params: {
    serverId: string;
    requesterUserId: string;
    days: number;
    roleFilter?: 'moderator' | 'member' | 'none' | 'all';
  }): Promise<string[]> {
    const { serverId, requesterUserId, days, roleFilter } = params;
    const server = await this.serverModel.findById(serverId).exec();
    if (!server)
      throw new NotFoundException(`Server with id ${serverId} not found`);
    if (server.ownerId.toString() !== requesterUserId) {
      throw new ForbiddenException(
        'Chỉ chủ máy chủ mới có thể lược bỏ thành viên',
      );
    }
    if (!Number.isFinite(days) || days <= 0) {
      throw new BadRequestException('days must be a positive number');
    }

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const normalizedRole = roleFilter ?? 'all';

    const members = server.members.filter((m) => {
      const uid = m.userId.toString();
      if (uid === server.ownerId.toString()) return false; // never prune owner
      if (normalizedRole === 'all') return true;
      if (normalizedRole === 'none') return m.role === 'member';
      return m.role === normalizedRole;
    });

    if (members.length === 0) return [];

    const userIds = members.map((m) => m.userId);
    const users = await this.userModel
      .find({ _id: { $in: userIds } })
      .select('_id createdAt loginDevices')
      .lean()
      .exec();

    const prunable: string[] = [];
    for (const u of users as any[]) {
      const deviceLastSeen: Date | null =
        Array.isArray(u.loginDevices) && u.loginDevices.length > 0
          ? (u.loginDevices
              .map((d: any) => (d?.lastSeenAt ? new Date(d.lastSeenAt) : null))
              .filter(Boolean)
              .sort((a: Date, b: Date) => b.getTime() - a.getTime())[0] ?? null)
          : null;
      const lastActive =
        deviceLastSeen ?? (u.createdAt ? new Date(u.createdAt) : new Date(0));
      if (lastActive < cutoff) {
        prunable.push(u._id.toString());
      }
    }
    return prunable;
  }

  /** Preview count for prune members. */
  async getPruneCount(params: {
    serverId: string;
    requesterUserId: string;
    days: number;
    roleFilter?: 'moderator' | 'member' | 'none' | 'all';
  }): Promise<number> {
    const ids = await this.resolvePrunableMemberIds(params);
    return ids.length;
  }

  /** Execute prune members (bulk kick). Returns number of removed members. */
  async pruneMembers(params: {
    serverId: string;
    requesterUserId: string;
    days: number;
    roleFilter?: 'moderator' | 'member' | 'none' | 'all';
  }): Promise<number> {
    const { serverId, requesterUserId } = params;
    const ids = await this.resolvePrunableMemberIds(params);
    if (ids.length === 0) return 0;

    const server = await this.serverModel.findById(serverId).exec();
    if (!server)
      throw new NotFoundException(`Server with id ${serverId} not found`);
    if (server.ownerId.toString() !== requesterUserId) {
      throw new ForbiddenException(
        'Chỉ chủ máy chủ mới có thể lược bỏ thành viên',
      );
    }

    const removeSet = new Set(ids);
    server.members = server.members.filter(
      (m) => !removeSet.has(m.userId.toString()),
    );
    server.memberCount = server.members.length;
    await server.save();
    for (const id of ids) {
      await this.cleanupAfterMemberRemoved(serverId, id);
    }
    return ids.length;
  }

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
      template: createServerDto.template || 'custom',
      purpose: createServerDto.purpose || 'me-and-friends',
      ownerId: userObjectId,
      members: [
        {
          userId: userObjectId,
          role: 'owner',
          joinedAt: new Date(),
        },
      ],
      memberCount: 1,
      isPublic: true,
    });

    const savedServer = await server.save();

    // Template channel definitions
    const template = createServerDto.template || 'custom';
    const lang = createServerDto.language || 'vi';

    interface ChannelDef {
      name: string;
      type: 'text' | 'voice';
      category?: string | null;
      isDefault?: boolean;
    }

    // Localised names for system categories and channel slots
    const CATEGORY_NAMES: Record<string, Record<string, string>> = {
      info: { vi: 'Thông Tin', en: 'Information', ja: '情報', zh: '信息' },
      text: {
        vi: 'Kênh Chat',
        en: 'Text Channels',
        ja: 'テキストチャンネル',
        zh: '文字频道',
      },
      voice: {
        vi: 'Kênh Thoại',
        en: 'Voice Channels',
        ja: 'ボイスチャンネル',
        zh: '语音频道',
      },
    };

    const CH: Record<string, Record<string, string>> = {
      general: { vi: 'chung', en: 'general', ja: '一般', zh: '综合' },
      generalVoice: { vi: 'general', en: 'general', ja: '一般', zh: '综合' },
      highlights: {
        vi: 'khoảnh-khắc-đỉnh-cao',
        en: 'highlights',
        ja: 'ハイライト',
        zh: '精彩时刻',
      },
      lobby: { vi: 'Sảnh', en: 'Lobby', ja: 'ロビー', zh: '大厅' },
      gaming: { vi: 'trò-chơi', en: 'gaming', ja: 'ゲーム', zh: '游戏' },
      music: { vi: 'âm-nhạc', en: 'music', ja: '音楽', zh: '音乐' },
      waitingRoom: {
        vi: 'Phòng Chờ',
        en: 'Waiting Room',
        ja: '待機室',
        zh: '等待室',
      },
      streamingRoom: {
        vi: 'Phòng Stream',
        en: 'Streaming',
        ja: '配信',
        zh: '直播',
      },
      welcomeAndRules: {
        vi: 'chào-mừng-và-nội-quy',
        en: 'welcome-and-rules',
        ja: 'ようこそ-ルール',
        zh: '欢迎-规则',
      },
      notesResources: {
        vi: 'ghi-chú-tài-nguyên',
        en: 'notes-resources',
        ja: 'ノート-リソース',
        zh: '笔记-资源',
      },
      homeworkHelp: {
        vi: 'trợ-giúp-làm-bài-tập-về-nhà',
        en: 'homework-help',
        ja: '宿題サポート',
        zh: '作业帮助',
      },
      sessionPlanning: {
        vi: 'lên-kế-hoạch-phiên',
        en: 'session-planning',
        ja: 'セッション計画',
        zh: '学习计划',
      },
      offTopic: { vi: 'lạc-đề', en: 'off-topic', ja: '雑談', zh: '闲聊' },
      studyRoom1: {
        vi: 'Phòng Học 1',
        en: 'Study Room 1',
        ja: '学習室-1',
        zh: '学习室-1',
      },
      studyRoom2: {
        vi: 'Phòng Học 2',
        en: 'Study Room 2',
        ja: '学習室-2',
        zh: '学习室-2',
      },
      announcements: {
        vi: 'thông-báo',
        en: 'announcements',
        ja: 'お知らせ',
        zh: '公告',
      },
      resources: {
        vi: 'tài-nguyên',
        en: 'resources',
        ja: 'リソース',
        zh: '资源',
      },
      meetingPlan: {
        vi: 'kế-hoạch-buổi-họp',
        en: 'meeting-plan',
        ja: '会議計画',
        zh: '会议计划',
      },
      meetingRoom1: {
        vi: 'Phòng Họp 1',
        en: 'Meeting Room 1',
        ja: '会議室-1',
        zh: '会议室-1',
      },
      meetingRoom2: {
        vi: 'Phòng Họp 2',
        en: 'Meeting Room 2',
        ja: '会議室-2',
        zh: '会议室-2',
      },
      events: { vi: 'sự-kiện', en: 'events', ja: 'イベント', zh: '活动' },
      feedback: {
        vi: 'ý-kiến-và-phản-hồi',
        en: 'feedback',
        ja: 'フィードバック',
        zh: '反馈',
      },
      communityHub: {
        vi: 'Nơi Tập Trung Cộng Đồng',
        en: 'Community Hub',
        ja: 'コミュニティハブ',
        zh: '社区中心',
      },
    };

    const c = (key: string): string =>
      CH[key]?.[lang] ?? CH[key]?.['vi'] ?? key;

    const templateChannels: Record<string, ChannelDef[]> = {
      custom: [
        { name: c('general'), type: 'text', isDefault: true },
        { name: c('generalVoice'), type: 'voice', isDefault: true },
      ],
      gaming: [
        { name: c('general'), type: 'text', isDefault: true },
        { name: c('highlights'), type: 'text' },
        { name: c('lobby'), type: 'voice', isDefault: true },
        { name: 'Gaming', type: 'voice' },
      ],
      friends: [
        { name: c('general'), type: 'text', isDefault: true },
        { name: c('gaming'), type: 'text' },
        { name: c('music'), type: 'text' },
        { name: c('waitingRoom'), type: 'voice', isDefault: true },
        { name: c('streamingRoom'), type: 'voice' },
      ],
      'study-group': [
        { name: c('welcomeAndRules'), type: 'text', category: 'info' },
        { name: c('notesResources'), type: 'text', category: 'info' },
        { name: c('general'), type: 'text', isDefault: true },
        { name: c('homeworkHelp'), type: 'text' },
        { name: c('sessionPlanning'), type: 'text' },
        { name: c('offTopic'), type: 'text' },
        { name: c('waitingRoom'), type: 'voice', isDefault: true },
        { name: c('studyRoom1'), type: 'voice' },
        { name: c('studyRoom2'), type: 'voice' },
      ],
      'school-club': [
        { name: c('welcomeAndRules'), type: 'text', category: 'info' },
        { name: c('announcements'), type: 'text', category: 'info' },
        { name: c('resources'), type: 'text', category: 'info' },
        { name: c('general'), type: 'text', isDefault: true },
        { name: c('meetingPlan'), type: 'text' },
        { name: c('offTopic'), type: 'text' },
        { name: c('waitingRoom'), type: 'voice', isDefault: true },
        { name: c('meetingRoom1'), type: 'voice' },
        { name: c('meetingRoom2'), type: 'voice' },
      ],
      'local-community': [
        { name: c('welcomeAndRules'), type: 'text', category: 'info' },
        { name: c('announcements'), type: 'text', category: 'info' },
        { name: c('resources'), type: 'text', category: 'info' },
        { name: c('general'), type: 'text', isDefault: true },
        { name: c('meetingPlan'), type: 'text' },
        { name: c('offTopic'), type: 'text' },
        { name: c('waitingRoom'), type: 'voice', isDefault: true },
        { name: c('meetingRoom1'), type: 'voice' },
        { name: c('meetingRoom2'), type: 'voice' },
      ],
      'artists-creators': [
        { name: c('welcomeAndRules'), type: 'text', category: 'info' },
        { name: c('announcements'), type: 'text', category: 'info' },
        { name: c('general'), type: 'text', isDefault: true },
        { name: c('events'), type: 'text' },
        { name: c('feedback'), type: 'text' },
        { name: c('waitingRoom'), type: 'voice', isDefault: true },
        { name: c('communityHub'), type: 'voice' },
        { name: c('streamingRoom'), type: 'voice' },
      ],
    };

    const channelDefs =
      templateChannels[template] ?? templateChannels['custom'];
    const savedChannelIds: Types.ObjectId[] = [];

    const hasInfoChannels = channelDefs.some((d) => d.category === 'info');
    const hasTextChannels = channelDefs.some(
      (d) => d.type === 'text' && d.category !== 'info',
    );
    const hasVoiceChannels = channelDefs.some((d) => d.type === 'voice');

    let infoCatId: Types.ObjectId | null = null;
    let textCatId: Types.ObjectId | null = null;
    let voiceCatId: Types.ObjectId | null = null;
    let catPosition = 0;

    if (hasInfoChannels) {
      const infoCat = new this.channelCategoryModel({
        name: CATEGORY_NAMES['info'][lang] ?? CATEGORY_NAMES['info']['vi'],
        serverId: savedServer._id,
        position: catPosition++,
        type: 'text',
      });
      const saved = await infoCat.save();
      infoCatId = saved._id;
    }
    if (hasTextChannels) {
      const textCat = new this.channelCategoryModel({
        name: CATEGORY_NAMES['text'][lang] ?? CATEGORY_NAMES['text']['vi'],
        serverId: savedServer._id,
        position: catPosition++,
        type: 'text',
      });
      const saved = await textCat.save();
      textCatId = saved._id;
    }
    if (hasVoiceChannels) {
      const voiceCat = new this.channelCategoryModel({
        name: CATEGORY_NAMES['voice'][lang] ?? CATEGORY_NAMES['voice']['vi'],
        serverId: savedServer._id,
        position: catPosition++,
        type: 'voice',
      });
      const saved = await voiceCat.save();
      voiceCatId = saved._id;
    }

    let textPos = 0;
    let voicePos = 0;
    let infoPos = 0;
    for (const def of channelDefs) {
      let assignedCatId: Types.ObjectId | null = null;
      let pos = 0;
      if (def.category === 'info') {
        assignedCatId = infoCatId;
        pos = infoPos++;
      } else if (def.type === 'text') {
        assignedCatId = textCatId;
        pos = textPos++;
      } else {
        assignedCatId = voiceCatId;
        pos = voicePos++;
      }

      const channel = new this.channelModel({
        name: def.name,
        type: def.type,
        description: null,
        serverId: savedServer._id,
        createdBy: userObjectId,
        isDefault: def.isDefault ?? false,
        category: def.category ?? null,
        categoryId: assignedCatId,
        position: pos,
      });
      const saved = await channel.save();
      savedChannelIds.push(saved._id);
    }

    savedServer.channels = savedChannelIds;

    // Auto-set systemChannelId to the first info text channel or default text channel
    const allCreatedChannels = await this.channelModel
      .find({ serverId: savedServer._id, type: 'text' })
      .sort({ position: 1 })
      .lean()
      .exec();
    const infoChannel = allCreatedChannels.find(
      (c: any) => c.category === 'info',
    );
    const defaultTextChannel = allCreatedChannels.find((c: any) => c.isDefault);
    const autoSystemChannel =
      infoChannel || defaultTextChannel || allCreatedChannels[0];
    if (autoSystemChannel) {
      (savedServer as any).interactionSettings = {
        ...((savedServer as any).interactionSettings ?? {}),
        systemChannelId: autoSystemChannel._id,
      };
    }

    await savedServer.save();

    // Create default @everyone role for the server
    await this.rolesService.createDefaultRole(savedServer._id.toString());

    return savedServer;
  }

  async createCategory(
    serverId: string,
    userId: string,
    name: string,
    isPrivate: boolean = false,
  ) {
    const server = await this.serverModel.findById(serverId);
    if (!server) throw new NotFoundException('Server not found');

    const member = server.members.find((m) => m.userId.toString() === userId);
    if (!member || member.role === 'member') {
      throw new ForbiddenException(
        'Only owner or moderator can create categories',
      );
    }

    const position = server.serverCategories?.length ?? 0;
    const category = {
      _id: new Types.ObjectId(),
      name,
      position,
      isPrivate,
    };

    server.serverCategories = [
      ...(server.serverCategories ?? []),
      category as any,
    ];
    await server.save();

    return category;
  }

  async getCategories(serverId: string) {
    const server = await this.serverModel.findById(serverId).lean();
    if (!server) throw new NotFoundException('Server not found');
    return (server.serverCategories ?? []).sort(
      (a: any, b: any) => a.position - b.position,
    );
  }

  async getMentionSuggestions(
    serverId: string,
    userId: string,
    keyword: string,
  ): Promise<
    Array<{
      id: string;
      name: string;
      type: 'special' | 'role' | 'user';
      description: string;
      avatarUrl?: string;
      color?: string;
    }>
  > {
    const server = await this.serverModel.findById(serverId).lean().exec();
    if (!server) throw new NotFoundException('Server not found');

    const isMember = (server as any).members.some(
      (m: any) => m.userId.toString() === userId,
    );
    if (!isMember) throw new ForbiddenException('Bạn không phải thành viên');

    const isOwner = (server as any).ownerId.toString() === userId;
    const permissions = isOwner
      ? { mentionEveryone: true, manageServer: true }
      : await this.rolesService.calculateMemberPermissions(serverId, userId);

    /** Chỉ chủ server hoặc quyền mentionEveryone — không có quyền thì không gợi ý đề cập (người khác vẫn có thể @ bạn). */
    const canMentionEveryone =
      isOwner ||
      Boolean((permissions as { mentionEveryone?: boolean }).mentionEveryone);
    if (!canMentionEveryone) {
      return [];
    }

    const lowerKeyword = keyword.trim().toLowerCase();

    const matchesSpecialMention = (
      displayName: string,
      kw: string,
    ): boolean => {
      if (!kw) return true;
      const n = displayName.toLowerCase();
      const withoutAt = n.startsWith('@') ? n.slice(1) : n;
      return n.includes(kw) || withoutAt.includes(kw);
    };

    const results: Array<{
      id: string;
      name: string;
      type: 'special' | 'role' | 'user';
      description: string;
      avatarUrl?: string;
      color?: string;
    }> = [];

    /** Hardcode — không lấy từ DB */
    const specials: Array<{
      id: string;
      name: string;
      type: 'special';
      description: string;
    }> = [
      {
        id: 'special_everyone',
        name: '@everyone',
        type: 'special',
        description: 'Thông báo đến tất cả mọi người có quyền xem kênh này.',
      },
      {
        id: 'special_here',
        name: '@here',
        type: 'special',
        description: 'Thông báo đến tất cả mọi người có quyền được xem kênh.',
      },
    ];

    for (const s of specials) {
      if (matchesSpecialMention(s.name, lowerKeyword)) {
        results.push(s);
      }
    }

    const userRows: typeof results = [];
    const memberUserIds = (server as any).members.map(
      (m: any) => new Types.ObjectId(m.userId),
    );
    const profiles = await this.profileModel
      .find({ userId: { $in: memberUserIds } })
      .select('userId displayName username avatarUrl')
      .lean()
      .exec();

    for (const p of profiles as any[]) {
      const uid = p.userId.toString();
      if (uid === userId) continue;
      const displayName = p.displayName || p.username || 'Người dùng';
      const username = p.username || '';
      if (
        lowerKeyword &&
        !displayName.toLowerCase().includes(lowerKeyword) &&
        !username.toLowerCase().includes(lowerKeyword)
      ) {
        continue;
      }
      userRows.push({
        id: uid,
        name: displayName,
        type: 'user',
        description: username,
        avatarUrl: p.avatarUrl || undefined,
      });
    }

    const roleRows: typeof results = [];
    const roles = await this.rolesService.getRolesByServer(serverId);
    for (const role of roles) {
      if (role.isDefault) continue;
      const canMention = (role as any).mentionable || canMentionEveryone;
      if (!canMention) continue;
      const roleName = `@${role.name}`;
      if (lowerKeyword && !roleName.toLowerCase().includes(lowerKeyword))
        continue;
      roleRows.push({
        id: `role_${(role as any)._id.toString()}`,
        name: roleName,
        type: 'role',
        description: 'Nhắc nhở người dùng có vai trò được quyền xem kênh này.',
        color: role.color,
      });
    }

    /** Thứ tự: special → user → role */
    return [...results, ...userRows, ...roleRows].slice(0, 25);
  }

  async getServersByUserId(userId: string): Promise<Server[]> {
    const userObjectId = new Types.ObjectId(userId);
    return this.serverModel
      .find({
        'members.userId': userObjectId,
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      })
      .populate('channels')
      .exec();
  }

  async getServerById(serverId: string): Promise<Server> {
    const server = await this.serverModel
      .findOne({
        _id: new Types.ObjectId(serverId),
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      })
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

  async getServerProfileStats(serverId: string): Promise<{
    onlineCount: number;
    memberCount: number;
    createdAt: Date;
  }> {
    const server = await this.serverModel
      .findOne({
        _id: new Types.ObjectId(serverId),
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      })
      .select('members memberCount createdAt')
      .lean()
      .exec();
    if (!server)
      throw new NotFoundException(`Server with id ${serverId} not found`);
    const memberIds = ((server as any).members || [])
      .map((m: any) => m.userId)
      .filter(Boolean);
    const cutoff = new Date(Date.now() - 5 * 60 * 1000);
    const onlineCount = await this.userModel.countDocuments({
      _id: { $in: memberIds },
      loginDevices: { $elemMatch: { lastSeenAt: { $gte: cutoff } } },
    });
    return {
      onlineCount,
      memberCount: Number((server as any).memberCount || memberIds.length || 0),
      createdAt: (server as any).createdAt,
    };
  }

  async updateServer(
    serverId: string,
    updateServerDto: UpdateServerDto,
    userId: string,
  ): Promise<Server> {
    const server = await this.serverModel.findOne({
      _id: new Types.ObjectId(serverId),
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
    });

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

    const beforeName = server.name;
    if (updateServerDto.name) server.name = updateServerDto.name;
    if (updateServerDto.description !== undefined)
      server.description = updateServerDto.description;
    if (updateServerDto.avatarUrl !== undefined)
      server.avatarUrl = updateServerDto.avatarUrl;
    if (updateServerDto.bannerUrl !== undefined)
      (server as any).bannerUrl = updateServerDto.bannerUrl;
    if (updateServerDto.bannerImageUrl !== undefined)
      (server as any).bannerImageUrl = updateServerDto.bannerImageUrl;
    if (updateServerDto.bannerColor !== undefined)
      (server as any).bannerColor = updateServerDto.bannerColor;
    // Đồng bộ trường legacy: bannerUrl = ảnh hoặc màu (cho client cũ)
    const img = (server as any).bannerImageUrl;
    const col = (server as any).bannerColor;
    if (
      updateServerDto.bannerImageUrl !== undefined ||
      updateServerDto.bannerColor !== undefined
    ) {
      (server as any).bannerUrl = img || col || (server as any).bannerUrl;
    }
    if (updateServerDto.profileTraits !== undefined) {
      const traits = (updateServerDto.profileTraits || [])
        .slice(0, 5)
        .map((t: any) => ({
          emoji: (t?.emoji || '🙂').toString().trim().slice(0, 8),
          text: (t?.text || '').toString().trim().slice(0, 80),
        }))
        .filter((t) => t.text.length > 0);
      (server as any).profileTraits = traits;
    }
    if (updateServerDto.isPublic !== undefined)
      server.isPublic = updateServerDto.isPublic;
    if (updateServerDto.safetySettings !== undefined)
      (server as any).safetySettings = {
        ...((server as any).safetySettings || {}),
        ...(updateServerDto.safetySettings || {}),
      };
    const saved = await server.save();
    await this.auditLogService.logServerEvent({
      serverId,
      actorUserId: userId,
      action: 'server.update',
      targetType: 'server',
      targetId: serverId,
      changes: [{ field: 'name', from: beforeName, to: saved.name }],
    });
    return saved;
  }

  async getServerSafetySettings(serverId: string, userId: string) {
    const server = await this.serverModel
      .findById(serverId)
      .select('ownerId safetySettings')
      .lean()
      .exec();
    if (!server)
      throw new NotFoundException(`Server with id ${serverId} not found`);
    const canManage =
      (server as any).ownerId?.toString() === userId ||
      (await this.rolesService.hasPermission(serverId, userId, 'manageServer'));
    if (!canManage)
      throw new ForbiddenException('Bạn không có quyền xem thiết lập an toàn');
    return (server as any).safetySettings || {};
  }

  async updateServerSafetySettings(
    serverId: string,
    userId: string,
    patch: Record<string, any>,
  ) {
    const server = await this.serverModel
      .findById(serverId)
      .select('ownerId safetySettings')
      .lean()
      .exec();
    if (!server)
      throw new NotFoundException(`Server with id ${serverId} not found`);
    const canManage =
      (server as any).ownerId?.toString() === userId ||
      (await this.rolesService.hasPermission(serverId, userId, 'manageServer'));
    if (!canManage)
      throw new ForbiddenException(
        'Bạn không có quyền cập nhật thiết lập an toàn',
      );

    const current = (server as any).safetySettings
      ? JSON.parse(JSON.stringify((server as any).safetySettings))
      : {};
    const merged = { ...current, ...(patch || {}) };

    const updated = await this.serverModel
      .findByIdAndUpdate(
        serverId,
        { $set: { safetySettings: merged } },
        { new: true },
      )
      .select('safetySettings')
      .lean()
      .exec();

    await this.auditLogService.logServerEvent({
      serverId,
      actorUserId: userId,
      action: 'server.safety.update',
      targetType: 'server',
      targetId: serverId,
      changes: [{ field: 'safetySettings', to: patch }],
    });
    return (updated as any)?.safetySettings || {};
  }

  async getServerAuditLogs(
    serverId: string,
    userId: string,
    query?: {
      action?: string;
      actorUserId?: string;
      limit?: number;
      before?: string;
    },
  ) {
    const server = await this.serverModel
      .findById(serverId)
      .select('ownerId')
      .lean()
      .exec();
    if (!server)
      throw new NotFoundException(`Server with id ${serverId} not found`);
    const canView =
      (server as any).ownerId?.toString() === userId ||
      (await this.rolesService.hasPermission(serverId, userId, 'manageServer'));
    if (!canView)
      throw new ForbiddenException('Bạn không có quyền xem nhật ký');
    return this.auditLogService.getServerAuditLogs({
      serverId,
      action: query?.action,
      actorUserId: query?.actorUserId,
      limit: query?.limit,
      before: query?.before,
    });
  }

  async deleteServer(serverId: string, userId: string): Promise<void> {
    const server = await this.serverModel.findOne({
      _id: new Types.ObjectId(serverId),
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
    });

    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    // Check if user is owner
    if (server.ownerId.toString() !== userId) {
      throw new ForbiddenException('Only server owner can delete the server');
    }

    const serverName = (server as any).name?.trim?.() || 'Server';
    const ownerStr = server.ownerId.toString();
    const recipientSet = new Set<string>([ownerStr]);
    for (const m of server.members || []) {
      const uid = (m as any).userId?.toString?.();
      if (uid && Types.ObjectId.isValid(uid)) recipientSet.add(uid);
    }
    const recipientUserIds = Array.from(recipientSet);

    const encodedName = encodeURIComponent(serverName);
    try {
      await this.createUserNotification({
        serverId,
        actorId: userId,
        recipientUserIds,
        title: '__SYS:serverDeletedTitle',
        content: `__SYS:serverDeletedContent:${encodedName}`,
      });
    } catch (err) {
      console.error('[deleteServer] createUserNotification failed:', err);
    }

    const socketPayload = { serverId, serverName };
    for (const uid of recipientUserIds) {
      this.channelMessagesGateway.emitToUser(
        uid,
        'server-deleted',
        socketPayload,
      );
    }

    // Soft delete so admin can restore later (keeps owner + members + data).
    (server as any).deletedAt = new Date();
    (server as any).deletedByUserId = new Types.ObjectId(userId);
    await server.save();
  }

  async addMemberToServer(
    serverId: string,
    memberId: string,
    role: 'moderator' | 'member' = 'member',
    nickname?: string | null,
  ): Promise<Server> {
    const server = await this.serverModel.findById(serverId);

    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    const memberObjectId = new Types.ObjectId(memberId);

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
      nickname: nickname?.trim() || null,
    } as any);

    server.memberCount = server.members.length;

    const saved = await server.save();

    this.sendWelcomeMessage(serverId, memberId).catch((err) => {
      console.error('[sendWelcomeMessage] Failed:', err?.message || err);
    });

    return saved;
  }

  /**
   * Create a single welcome message when a user joins.
   * The frontend renders it as a special block (text + wave button).
   */
  async sendWelcomeMessagePublic(
    serverId: string,
    newMemberId: string,
  ): Promise<void> {
    return this.sendWelcomeMessage(serverId, newMemberId);
  }

  private async sendWelcomeMessage(
    serverId: string,
    newMemberId: string,
  ): Promise<void> {
    console.log(
      '[sendWelcomeMessage] serverId:',
      serverId,
      'newMemberId:',
      newMemberId,
    );
    const server = await this.serverModel
      .findById(serverId)
      .select('interactionSettings')
      .lean()
      .exec();
    if (!server) {
      console.log('[sendWelcomeMessage] Server not found');
      return;
    }

    const settings = (server as any).interactionSettings ?? {};
    console.log('[sendWelcomeMessage] settings:', JSON.stringify(settings));

    // Defaults: nếu field chưa tồn tại (undefined) thì coi như enabled (giống UI mặc định).
    if (settings.systemMessagesEnabled === false) {
      console.log('[sendWelcomeMessage] systemMessagesEnabled=false, skip');
      return;
    }
    if (settings.welcomeMessageEnabled === false) {
      console.log('[sendWelcomeMessage] welcomeMessageEnabled=false, skip');
      return;
    }

    const systemChannelId = settings.systemChannelId;
    if (!systemChannelId) {
      console.log('[sendWelcomeMessage] No systemChannelId, skip');
      return;
    }

    const channel = await this.channelModel.findById(systemChannelId).exec();
    if (!channel || channel.type !== 'text') {
      console.log(
        '[sendWelcomeMessage] Channel not found or not text, type:',
        channel?.type,
      );
      return;
    }
    console.log(
      '[sendWelcomeMessage] Sending to channel:',
      channel.name,
      channel._id,
    );

    const profile = await this.profileModel
      .findOne({ userId: new Types.ObjectId(newMemberId) })
      .select('displayName username')
      .lean()
      .exec();
    const displayName = profile?.displayName || profile?.username || 'Ai đó';

    const welcomeMsg = new this.messageModel({
      channelId: new Types.ObjectId(systemChannelId.toString()),
      senderId: new Types.ObjectId(newMemberId),
      content: `Rất vui được gặp bạn, ${displayName}!`,
      messageType: 'welcome',
      giphyId: null,
      attachments: [],
      replyTo: null,
      mentions: [],
    });
    const saved = await welcomeMsg.save();

    channel.messageCount = (channel.messageCount || 0) + 1;
    await channel.save();

    const stickerReply = settings.stickerReplyWelcomeEnabled ?? true;
    const enriched = await this.enrichWelcomeMessage(saved);
    if (enriched) {
      enriched.stickerReplyWelcomeEnabled = stickerReply;
      this.channelMessagesGateway.emitNewMessage(
        systemChannelId.toString(),
        enriched,
      );
    }
  }

  private async enrichWelcomeMessage(msg: any): Promise<any> {
    const senderId = msg.senderId;
    const profile = await this.profileModel
      .findOne({ userId: new Types.ObjectId(senderId.toString()) })
      .select('username displayName avatarUrl')
      .lean()
      .exec();

    return {
      _id: msg._id,
      channelId: msg.channelId,
      senderId: {
        _id: senderId,
        email: '',
        displayName: profile?.displayName ?? undefined,
        username: profile?.username ?? undefined,
        avatarUrl: profile?.avatarUrl ?? undefined,
      },
      content: msg.content,
      messageType: msg.messageType,
      giphyId: msg.giphyId,
      attachments: msg.attachments,
      reactions: [],
      replyTo: null,
      mentions: [],
      isEdited: false,
      editedAt: null,
      isDeleted: false,
      createdAt: msg.createdAt,
      updatedAt: msg.updatedAt,
    };
  }

  /** Join a public server (used from event link). Fails if server is private. */
  async joinServer(
    serverId: string,
    userId: string,
    joinOpts?: {
      rulesAccepted?: boolean;
      nickname?: string;
      applicationAnswers?: Array<{
        questionId: string;
        text?: string;
        selectedOption?: string;
      }>;
    },
  ): Promise<Server> {
    const userServer = await this.serverAccessService.joinServer(
      userId,
      serverId,
      joinOpts,
    );
    const isPending = userServer?.status === 'pending';

    if (joinOpts?.nickname?.trim() && !isPending) {
      await this.serverModel
        .updateOne(
          {
            _id: new Types.ObjectId(serverId),
            'members.userId': new Types.ObjectId(userId),
          },
          { $set: { 'members.$.nickname': joinOpts.nickname.trim() } },
        )
        .exec();
    }

    if (!isPending) {
      this.sendWelcomeMessage(serverId, userId).catch((err) => {
        console.error('[sendWelcomeMessage] Failed:', err?.message || err);
      });
    }

    this.serverInviteModel
      .updateMany(
        {
          toUserId: new Types.ObjectId(userId),
          serverId: new Types.ObjectId(serverId),
          status: 'pending',
        },
        { $set: { status: 'accepted', respondedAt: new Date() } },
      )
      .exec()
      .catch(() => {});
    return this.getServerById(serverId);
  }

  async setMemberNickname(
    serverId: string,
    userId: string,
    nickname: string,
  ): Promise<void> {
    const trimmed = nickname.trim();
    await this.serverModel
      .updateOne(
        {
          _id: new Types.ObjectId(serverId),
          'members.userId': new Types.ObjectId(userId),
        },
        { $set: { 'members.$.nickname': trimmed === '' ? null : trimmed } },
      )
      .exec();
  }

  /** Thành viên tự đổi biệt danh trên máy chủ (chỉ chính họ). */
  async updateMyServerNickname(
    serverId: string,
    userId: string,
    nickname: string,
  ): Promise<void> {
    const server = await this.serverModel
      .findOne({
        _id: new Types.ObjectId(serverId),
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      })
      .select('members')
      .exec();
    if (!server) {
      throw new NotFoundException('Server not found');
    }
    if (!this.isMember(server, userId)) {
      throw new ForbiddenException('Not a member of this server');
    }
    if (nickname.trim().length > 64) {
      throw new BadRequestException('nickname too long');
    }
    await this.setMemberNickname(serverId, userId, nickname);
  }

  private async ensureUserServerAcceptedDoc(params: {
    serverId: string;
    userId: string;
  }): Promise<void> {
    const { serverId, userId } = params;
    const existing = await this.userServerModel
      .findOne({
        serverId: new Types.ObjectId(serverId),
        userId: new Types.ObjectId(userId),
      })
      .select('_id status')
      .lean()
      .exec();
    if (existing?._id) return;
    await this.userServerModel
      .create({
        serverId: new Types.ObjectId(serverId),
        userId: new Types.ObjectId(userId),
        status: 'accepted',
        acceptedAt: new Date(),
      } as any)
      .catch(() => {});
  }

  async getMyServerProfile(
    serverId: string,
    userId: string,
  ): Promise<{
    nickname: string | null;
    avatarUrl: string | null;
    coverUrl: string | null;
    profileThemePrimaryHex?: string | null;
    profileThemeAccentHex?: string | null;
    displayNameFontId?: string | null;
    displayNameEffectId?: string | null;
    displayNamePrimaryHex?: string | null;
    displayNameAccentHex?: string | null;
  }> {
    const server = await this.serverModel
      .findById(serverId)
      .select('members')
      .lean()
      .exec();
    if (!server) throw new NotFoundException('Server not found');
    if (!this.isMember(server as any, userId)) {
      throw new ForbiddenException('Not a member of this server');
    }
    const me = (server as any).members?.find(
      (m: any) => m?.userId?.toString?.() === userId,
    );
    const us = await this.userServerModel
      .findOne({
        serverId: new Types.ObjectId(serverId),
        userId: new Types.ObjectId(userId),
      })
      .select(
        'serverAvatarUrl serverCoverUrl serverProfileThemePrimaryHex serverProfileThemeAccentHex serverDisplayNameFontId serverDisplayNameEffectId serverDisplayNamePrimaryHex serverDisplayNameAccentHex',
      )
      .lean()
      .exec();
    return {
      nickname: (me?.nickname ?? null) as string | null,
      avatarUrl: (us as any)?.serverAvatarUrl ?? null,
      coverUrl: (us as any)?.serverCoverUrl ?? null,
      profileThemePrimaryHex: (us as any)?.serverProfileThemePrimaryHex ?? null,
      profileThemeAccentHex: (us as any)?.serverProfileThemeAccentHex ?? null,
      displayNameFontId: (us as any)?.serverDisplayNameFontId ?? null,
      displayNameEffectId: (us as any)?.serverDisplayNameEffectId ?? null,
      displayNamePrimaryHex: (us as any)?.serverDisplayNamePrimaryHex ?? null,
      displayNameAccentHex: (us as any)?.serverDisplayNameAccentHex ?? null,
    };
  }

  async updateMyServerProfile(
    serverId: string,
    userId: string,
    patch: {
      coverUrl?: string | null;
      profileThemePrimaryHex?: string | null;
      profileThemeAccentHex?: string | null;
      displayNameFontId?: string | null;
      displayNameEffectId?: string | null;
      displayNamePrimaryHex?: string | null;
      displayNameAccentHex?: string | null;
    },
  ): Promise<void> {
    const server = await this.serverModel
      .findById(serverId)
      .select('members')
      .lean()
      .exec();
    if (!server) throw new NotFoundException('Server not found');
    if (!this.isMember(server as any, userId)) {
      throw new ForbiddenException('Not a member of this server');
    }
    await this.ensureUserServerAcceptedDoc({ serverId, userId });
    const nextCover =
      patch.coverUrl == null ? null : String(patch.coverUrl).trim();
    const update: Record<string, unknown> = {
      serverCoverUrl: nextCover,
    };
    if (patch.profileThemePrimaryHex !== undefined) {
      update.serverProfileThemePrimaryHex =
        patch.profileThemePrimaryHex == null
          ? null
          : String(patch.profileThemePrimaryHex).trim();
    }
    if (patch.profileThemeAccentHex !== undefined) {
      update.serverProfileThemeAccentHex =
        patch.profileThemeAccentHex == null
          ? null
          : String(patch.profileThemeAccentHex).trim();
    }
    if (patch.displayNameFontId !== undefined) {
      update.serverDisplayNameFontId =
        patch.displayNameFontId == null
          ? null
          : String(patch.displayNameFontId).trim();
    }
    if (patch.displayNameEffectId !== undefined) {
      update.serverDisplayNameEffectId =
        patch.displayNameEffectId == null
          ? null
          : String(patch.displayNameEffectId).trim();
    }
    if (patch.displayNamePrimaryHex !== undefined) {
      update.serverDisplayNamePrimaryHex =
        patch.displayNamePrimaryHex == null
          ? null
          : String(patch.displayNamePrimaryHex).trim();
    }
    if (patch.displayNameAccentHex !== undefined) {
      update.serverDisplayNameAccentHex =
        patch.displayNameAccentHex == null
          ? null
          : String(patch.displayNameAccentHex).trim();
    }
    await this.userServerModel
      .updateOne(
        {
          serverId: new Types.ObjectId(serverId),
          userId: new Types.ObjectId(userId),
        },
        { $set: update },
      )
      .exec();

    const memberIds = (server as any).members.map((m: any) =>
      (m?.userId?._id ?? m?.userId).toString(),
    );
    memberIds.forEach((uid: string) => {
      this.channelMessagesGateway.emitToUser(uid, 'server-member-profile-updated', {
        serverId,
        userId,
        coverUrl: nextCover,
        avatarUrl: undefined,
        profileThemePrimaryHex: (update as any).serverProfileThemePrimaryHex,
        profileThemeAccentHex: (update as any).serverProfileThemeAccentHex,
        displayNameFontId: (update as any).serverDisplayNameFontId,
        displayNameEffectId: (update as any).serverDisplayNameEffectId,
        displayNamePrimaryHex: (update as any).serverDisplayNamePrimaryHex,
        displayNameAccentHex: (update as any).serverDisplayNameAccentHex,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  async setMyServerAvatar(
    serverId: string,
    userId: string,
    params: { avatarUrl: string },
  ): Promise<{ avatarUrl: string }> {
    const server = await this.serverModel
      .findById(serverId)
      .select('members')
      .lean()
      .exec();
    if (!server) throw new NotFoundException('Server not found');
    if (!this.isMember(server as any, userId)) {
      throw new ForbiddenException('Not a member of this server');
    }
    await this.ensureUserServerAcceptedDoc({ serverId, userId });
    const next = String(params.avatarUrl || '').trim();
    if (!next) throw new BadRequestException('avatarUrl is required');
    await this.userServerModel
      .updateOne(
        {
          serverId: new Types.ObjectId(serverId),
          userId: new Types.ObjectId(userId),
        },
        { $set: { serverAvatarUrl: next } },
      )
      .exec();

    const memberIds = (server as any).members.map((m: any) =>
      (m?.userId?._id ?? m?.userId).toString(),
    );
    memberIds.forEach((uid: string) => {
      this.channelMessagesGateway.emitToUser(uid, 'server-member-profile-updated', {
        serverId,
        userId,
        avatarUrl: next,
        coverUrl: undefined,
        updatedAt: new Date().toISOString(),
      });
    });

    return { avatarUrl: next };
  }

  async resetMyServerAvatar(
    serverId: string,
    userId: string,
  ): Promise<{ avatarUrl: null }> {
    const server = await this.serverModel
      .findById(serverId)
      .select('members')
      .lean()
      .exec();
    if (!server) throw new NotFoundException('Server not found');
    if (!this.isMember(server as any, userId)) {
      throw new ForbiddenException('Not a member of this server');
    }
    await this.ensureUserServerAcceptedDoc({ serverId, userId });
    await this.userServerModel
      .updateOne(
        {
          serverId: new Types.ObjectId(serverId),
          userId: new Types.ObjectId(userId),
        },
        { $set: { serverAvatarUrl: null } },
      )
      .exec();

    const memberIds = (server as any).members.map((m: any) =>
      (m?.userId?._id ?? m?.userId).toString(),
    );
    memberIds.forEach((uid: string) => {
      this.channelMessagesGateway.emitToUser(uid, 'server-member-profile-updated', {
        serverId,
        userId,
        avatarUrl: null,
        coverUrl: undefined,
        updatedAt: new Date().toISOString(),
      });
    });

    return { avatarUrl: null };
  }

  isMember(server: Server, userId: string): boolean {
    return server.members.some((m) => m.userId.toString() === userId);
  }

  /**
   * Sau khi xóa user khỏi server.members: gỡ khỏi mọi role (trừ @everyone) và xóa UserServer.
   * Tránh ghost: badge đơn pending / đếm thành viên vai trò.
   */
  private async cleanupAfterMemberRemoved(
    serverId: string,
    memberId: string,
  ): Promise<void> {
    await this.rolesService.removeMemberFromAllNonDefaultRoles(
      serverId,
      memberId,
    );
    await this.serverAccessService.deleteUserServerRecord(serverId, memberId);
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

    const saved = await server.save();
    await this.cleanupAfterMemberRemoved(serverId, memberId);
    return saved;
  }

  /** Thành viên (không phải chủ) rời máy chủ. Chủ không thể rời. */
  async leaveServer(serverId: string, userId: string): Promise<void> {
    const server = await this.serverModel.findById(serverId);

    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    if (server.ownerId.toString() === userId) {
      throw new ForbiddenException(
        'Chủ máy chủ không thể rời. Hãy chuyển quyền hoặc xóa máy chủ.',
      );
    }

    const wasMember = server.members.some(
      (m) => m.userId.toString() === userId,
    );
    if (!wasMember) {
      return;
    }

    server.members = server.members.filter(
      (m) => m.userId.toString() !== userId,
    );
    server.memberCount = server.members.length;
    await server.save();
    await this.cleanupAfterMemberRemoved(serverId, userId);
  }

  /**
   * Đảm bảo chủ server luôn có trong `server.members` và `role === 'owner'`.
   * Một số bản ghi lệch (chỉ có ownerId, thiếu phần tử trong members) khiến tab Thành viên không hiện chủ.
   */
  async ensureOwnerMemberRow(server: Server): Promise<void> {
    const oid = server.ownerId;
    if (!oid) return;
    const ownerStr = oid.toString();
    if (!server.members) server.members = [];

    const idx = server.members.findIndex(
      (m) => m?.userId && m.userId.toString() === ownerStr,
    );

    let needsSave = false;
    const created = (server as { createdAt?: Date }).createdAt ?? new Date();

    if (idx < 0) {
      server.members.push({
        userId: new Types.ObjectId(ownerStr),
        role: 'owner',
        joinedAt: created instanceof Date ? created : new Date(created),
      });
      needsSave = true;
    } else if (server.members[idx].role !== 'owner') {
      server.members[idx].role = 'owner';
      needsSave = true;
    }

    if (needsSave) {
      server.memberCount = server.members.length;
      await this.serverModel.updateOne(
        { _id: server._id },
        {
          $set: {
            members: server.members,
            memberCount: server.memberCount,
          },
        },
      );
    }
  }

  /** Danh sách thành viên máy chủ (chỉ chủ server). Trả về: tên, avatar, gia nhập server từ, đã tham gia Cordigram, cách gia nhập (link / mời bởi). */
  async getServerMembers(
    serverId: string,
    requesterUserId: string,
  ): Promise<
    Array<{
      userId: string;
      displayName: string;
      username: string;
      nickname: string | null;
      avatarUrl: string;
      joinedAt: Date;
      joinedCordigramAt: Date;
      joinMethod: 'owner' | 'invited' | 'link';
      invitedBy?: { id: string; username: string };
      role: string;
    }>
  > {
    const server = await this.serverModel.findById(serverId).exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }
    await this.ensureOwnerMemberRow(server);

    const isOwner = server.ownerId.toString() === requesterUserId;
    const canManage =
      isOwner ||
      (await this.rolesService.hasPermission(
        serverId,
        requesterUserId,
        'manageServer',
      ));
    if (!canManage) {
      throw new ForbiddenException(
        'Bạn không có quyền xem danh sách thành viên',
      );
    }

    const memberIds = server.members.map((m) => m.userId.toString());
    const userIds = server.members.map((m) => m.userId);
    const users = await this.userModel
      .find({ _id: { $in: userIds } })
      .select('_id createdAt')
      .lean()
      .exec();
    const userMap = new Map(
      users.map((u) => [
        u._id.toString(),
        u as unknown as { _id: Types.ObjectId; createdAt: Date },
      ]),
    );

    const profiles = await this.profileModel
      .find({ userId: { $in: userIds } })
      .select('userId displayName username avatarUrl')
      .lean()
      .exec();
    const profileByUserId = new Map(
      profiles.map((p: any) => [p.userId.toString(), p]),
    );

    const serverObjectId = new Types.ObjectId(serverId);
    const acceptedInvites = await this.serverInviteModel
      .find({
        serverId: serverObjectId,
        status: 'accepted',
        toUserId: { $in: userIds },
      })
      .populate('fromUserId', '_id')
      .lean()
      .exec();
    const inviteByToId = new Map<
      string,
      { fromUserId: string; fromUsername?: string }
    >();
    const inviterIds = [
      ...new Set(
        (acceptedInvites as any[]).map((inv) => {
          const from = inv.fromUserId;
          return (from?._id ?? from)?.toString();
        }),
      ),
    ].filter(Boolean);
    if (inviterIds.length > 0) {
      const inviterProfiles = await this.profileModel
        .find({
          userId: { $in: inviterIds.map((id) => new Types.ObjectId(id)) },
        })
        .select('userId username')
        .lean()
        .exec();
      const inviterMap = new Map(
        (inviterProfiles as any[]).map((p) => [
          p.userId.toString(),
          p.username,
        ]),
      );
      for (const inv of acceptedInvites as any[]) {
        const toId = (inv.toUserId?._id ?? inv.toUserId)?.toString();
        const fromId = (inv.fromUserId?._id ?? inv.fromUserId)?.toString();
        if (toId && fromId) {
          inviteByToId.set(toId, {
            fromUserId: fromId,
            fromUsername: inviterMap.get(fromId),
          });
        }
      }
    }

    const result: Array<{
      userId: string;
      displayName: string;
      username: string;
      nickname: string | null;
      avatarUrl: string;
      joinedAt: Date;
      joinedCordigramAt: Date;
      joinMethod: 'owner' | 'invited' | 'link';
      invitedBy?: { id: string; username: string };
      role: string;
    }> = [];

    for (const m of server.members) {
      const uid = m.userId.toString();
      const profile = profileByUserId.get(uid) as
        | { displayName: string; username: string; avatarUrl: string }
        | undefined;
      const user = userMap.get(uid);
      const joinedCordigramAt = user?.createdAt
        ? new Date(user.createdAt)
        : m.joinedAt;
      const joinedAt =
        m.joinedAt instanceof Date ? m.joinedAt : new Date(m.joinedAt);
      const isOwner = server.ownerId.toString() === uid;
      const invite = inviteByToId.get(uid);

      let joinMethod: 'owner' | 'invited' | 'link' = 'link';
      let invitedBy: { id: string; username: string } | undefined;
      if (isOwner) {
        joinMethod = 'owner';
      } else if (invite) {
        joinMethod = 'invited';
        invitedBy = {
          id: invite.fromUserId,
          username: invite.fromUsername ?? 'Người dùng',
        };
      }

      const rawNick = m.nickname;
      const nickname =
        typeof rawNick === 'string' && rawNick.trim() !== ''
          ? rawNick.trim()
          : null;

      result.push({
        userId: uid,
        displayName: profile?.displayName ?? 'Người dùng',
        username: profile?.username ?? uid,
        nickname,
        avatarUrl: profile?.avatarUrl ?? '',
        joinedAt,
        joinedCordigramAt,
        joinMethod,
        invitedBy,
        role: m.role,
      });
    }

    return result;
  }

  // =====================================================
  // MODERATOR VIEW - MEMBERS SUMMARY
  // =====================================================

  /**
   * Moderator View: danh sách thành viên với thông tin mở rộng cho bảng
   * Chỉ owner hoặc user có quyền manageServer/kickMembers mới xem được
   */
  async getModeratorMembersSummary(
    serverId: string,
    requesterUserId: string,
  ): Promise<
    Array<{
      userId: string;
      displayName: string;
      username: string;
      avatarUrl: string;
      joinedAt: Date;
      accountCreatedAt: Date;
      accountAgeDays: number;
      joinMethod: 'owner' | 'invited' | 'link';
      invitedBy?: { id: string; username: string };
      roles: Array<{
        _id: string;
        name: string;
        color: string;
        position: number;
      }>;
      flags: Array<'new-account' | 'spam' | 'suspicious-invite'>;
    }>
  > {
    const server = await this.serverModel
      .findById(serverId)
      .select('ownerId members channels')
      .exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    await this.ensureOwnerMemberRow(server as Server);

    const isMember = server.members.some(
      (m) => m.userId.toString() === requesterUserId,
    );
    if (!isMember) {
      throw new ForbiddenException('Bạn không phải thành viên của server này');
    }

    const isOwner = server.ownerId.toString() === requesterUserId;
    const canManageServer = await this.rolesService.hasPermission(
      serverId,
      requesterUserId,
      'manageServer',
    );
    const canKickMembers = await this.rolesService.hasPermission(
      serverId,
      requesterUserId,
      'kickMembers',
    );
    if (!isOwner && !canManageServer && !canKickMembers) {
      throw new ForbiddenException(
        'Chỉ owner hoặc thành viên có quyền quản lý/duyệt thành viên mới xem được Moderator View',
      );
    }

    const memberObjectIds = server.members.map((m) => m.userId);
    const memberIdStrings = memberObjectIds.map((id) => id.toString());

    // Lấy thông tin user (createdAt) để tính tuổi tài khoản
    const users = await this.userModel
      .find({ _id: { $in: memberObjectIds } })
      .select('_id createdAt')
      .lean()
      .exec();
    const userById = new Map<
      string,
      {
        _id: Types.ObjectId;
        createdAt: Date;
      }
    >(users.map((u: any) => [u._id.toString(), u]));

    // Lấy profile
    const profiles = await this.profileModel
      .find({ userId: { $in: memberObjectIds } })
      .select('userId displayName username avatarUrl')
      .lean()
      .exec();
    const profileByUserId = new Map(
      profiles.map((p: any) => [p.userId.toString(), p]),
    );

    // Join method + invitedBy giống getServerMembers (nhưng không giới hạn owner)
    const serverObjectId = new Types.ObjectId(serverId);
    const acceptedInvites = await this.serverInviteModel
      .find({
        serverId: serverObjectId,
        status: 'accepted',
        toUserId: { $in: memberObjectIds },
      })
      .populate('fromUserId', '_id')
      .lean()
      .exec();
    const inviteByToId = new Map<
      string,
      { fromUserId: string; fromUsername?: string; fromCreatedAt?: Date }
    >();
    const inviterIds = [
      ...new Set(
        (acceptedInvites as any[]).map((inv) => {
          const from = inv.fromUserId;
          return (from?._id ?? from)?.toString();
        }),
      ),
    ].filter(Boolean);
    if (inviterIds.length > 0) {
      const inviterUsers = await this.userModel
        .find({ _id: { $in: inviterIds.map((id) => new Types.ObjectId(id)) } })
        .select('_id createdAt')
        .lean()
        .exec();
      const inviterProfiles = await this.profileModel
        .find({
          userId: { $in: inviterIds.map((id) => new Types.ObjectId(id)) },
        })
        .select('userId username')
        .lean()
        .exec();
      const inviterCreatedAtById = new Map(
        inviterUsers.map((u: any) => [u._id.toString(), u.createdAt]),
      );
      const inviterUsernameById = new Map(
        inviterProfiles.map((p: any) => [p.userId.toString(), p.username]),
      );
      for (const inv of acceptedInvites as any[]) {
        const toId = (inv.toUserId?._id ?? inv.toUserId)?.toString();
        const fromId = (inv.fromUserId?._id ?? inv.fromUserId)?.toString();
        if (toId && fromId) {
          inviteByToId.set(toId, {
            fromUserId: fromId,
            fromUsername: inviterUsernameById.get(fromId),
            fromCreatedAt: inviterCreatedAtById.get(fromId),
          });
        }
      }
    }

    // Activity + spam stats (server-wide aggregate, 30 ngày gần nhất)
    const channelIds = ((server as any).channels ?? []) as Types.ObjectId[];
    const spamStatsByUserId = new Map<
      string,
      {
        totalLast30d: number;
        last10m: number;
        last24h: number;
        linkCount: number;
        mediaCount: number;
      }
    >();
    if (channelIds.length > 0) {
      const now = Date.now();
      const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
      const tenMinutesAgo = new Date(now - 10 * 60 * 1000);
      const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

      const agg = await this.messageModel.aggregate([
        {
          $match: {
            channelId: { $in: channelIds },
            senderId: { $in: memberObjectIds },
            createdAt: { $gte: thirtyDaysAgo },
          },
        },
        {
          $group: {
            _id: '$senderId',
            totalLast30d: { $sum: 1 },
            last10m: {
              $sum: {
                $cond: [{ $gte: ['$createdAt', tenMinutesAgo] }, 1, 0],
              },
            },
            last24h: {
              $sum: {
                $cond: [{ $gte: ['$createdAt', oneDayAgo] }, 1, 0],
              },
            },
            linkCount: {
              $sum: {
                $cond: [
                  {
                    $regexMatch: {
                      input: '$content',
                      regex: /https?:\/\//i,
                    },
                  },
                  1,
                  0,
                ],
              },
            },
            mediaCount: {
              $sum: {
                $cond: [
                  {
                    $gt: [{ $size: { $ifNull: ['$attachments', []] } }, 0],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]);

      for (const row of agg) {
        const uid = row._id.toString();
        spamStatsByUserId.set(uid, {
          totalLast30d: row.totalLast30d ?? 0,
          last10m: row.last10m ?? 0,
          last24h: row.last24h ?? 0,
          linkCount: row.linkCount ?? 0,
          mediaCount: row.mediaCount ?? 0,
        });
      }
    }

    const now = Date.now();
    const flagsResult: Array<{
      userId: string;
      flags: Array<'new-account' | 'spam' | 'suspicious-invite'>;
    }> = [];

    const suspiciousInviterIds = new Set<string>();

    // Precompute spam flags for inviters (dùng chung cho SuspiciousInvite)
    for (const [uid, stats] of spamStatsByUserId.entries()) {
      const isSpam = (stats.last10m ?? 0) > 50 || (stats.last24h ?? 0) > 200;
      if (isSpam) suspiciousInviterIds.add(uid);
    }

    const result: Array<{
      userId: string;
      displayName: string;
      username: string;
      avatarUrl: string;
      joinedAt: Date;
      accountCreatedAt: Date;
      accountAgeDays: number;
      joinMethod: 'owner' | 'invited' | 'link';
      invitedBy?: { id: string; username: string };
      roles: Array<{
        _id: string;
        name: string;
        color: string;
        position: number;
      }>;
      flags: Array<'new-account' | 'spam' | 'suspicious-invite'>;
    }> = [];

    for (const m of server.members) {
      const uid = m.userId.toString();
      const profile = profileByUserId.get(uid) as
        | { displayName: string; username: string; avatarUrl: string }
        | undefined;
      const user = userById.get(uid);
      const accountCreatedAt =
        user?.createdAt instanceof Date
          ? user.createdAt
          : user?.createdAt
            ? new Date(user.createdAt)
            : m.joinedAt instanceof Date
              ? m.joinedAt
              : new Date(m.joinedAt);
      const joinedAt =
        m.joinedAt instanceof Date ? m.joinedAt : new Date(m.joinedAt);

      const ageDays = Math.floor(
        (now - accountCreatedAt.getTime()) / (24 * 60 * 60 * 1000),
      );

      const invite = inviteByToId.get(uid);
      let joinMethod: 'owner' | 'invited' | 'link' = 'link';
      let invitedBy: { id: string; username: string } | undefined;
      if (server.ownerId.toString() === uid) {
        joinMethod = 'owner';
      } else if (invite) {
        joinMethod = 'invited';
        invitedBy = {
          id: invite.fromUserId,
          username: invite.fromUsername ?? 'Người dùng',
        };
      }

      const roleInfo = await this.rolesService.getMemberRoleInfo(serverId, uid);

      const stats = spamStatsByUserId.get(uid);
      const isSpam = stats && (stats.last10m > 50 || stats.last24h > 200);

      const memberFlags: Array<'new-account' | 'spam' | 'suspicious-invite'> =
        [];
      if (ageDays < 3) {
        memberFlags.push('new-account');
      }
      if (isSpam) {
        memberFlags.push('spam');
      }
      if (
        joinMethod === 'invited' &&
        invite?.fromUserId &&
        // Không bao giờ đánh dấu đáng ngờ nếu người mời là chủ server
        invite.fromUserId !== server.ownerId.toString() &&
        ((invite.fromCreatedAt &&
          (now - new Date(invite.fromCreatedAt).getTime()) /
            (24 * 60 * 60 * 1000) <
            7) ||
          suspiciousInviterIds.has(invite.fromUserId))
      ) {
        memberFlags.push('suspicious-invite');
      }

      result.push({
        userId: uid,
        displayName: profile?.displayName ?? 'Người dùng',
        username: profile?.username ?? uid,
        avatarUrl: profile?.avatarUrl ?? '',
        joinedAt,
        accountCreatedAt,
        accountAgeDays: ageDays,
        joinMethod,
        invitedBy,
        roles: roleInfo.roles,
        flags: memberFlags,
      });

      flagsResult.push({ userId: uid, flags: memberFlags });
    }

    return result;
  }

  // =====================================================
  // USER PERMISSIONS
  // =====================================================

  private async canManageServer(
    serverId: string,
    userId: string,
  ): Promise<boolean> {
    const server = await this.serverModel
      .findById(serverId)
      .select('ownerId')
      .lean()
      .exec();
    if (!server) return false;
    if (server.ownerId.toString() === userId) return true;
    return this.rolesService.hasPermission(serverId, userId, 'manageServer');
  }

  private async assertCanManageServer(
    serverId: string,
    userId: string,
  ): Promise<void> {
    const allowed = await this.canManageServer(serverId, userId);
    if (!allowed) {
      throw new ForbiddenException(
        'Chỉ chủ máy chủ hoặc thành viên có quyền Quản Lý Máy Chủ mới được thực hiện',
      );
    }
  }

  async getInteractionSettings(
    serverId: string,
    requesterUserId: string,
  ): Promise<{
    systemMessagesEnabled: boolean;
    welcomeMessageEnabled: boolean;
    stickerReplyWelcomeEnabled: boolean;
    defaultNotificationLevel: 'all' | 'mentions';
    systemChannelId: string | null;
    canEdit: boolean;
  }> {
    const server = await this.serverModel.findById(serverId).exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }
    const isMember = server.members.some(
      (m) => m.userId.toString() === requesterUserId,
    );
    if (!isMember) {
      throw new ForbiddenException('Bạn không phải thành viên của server này');
    }
    const canEdit = await this.canManageServer(serverId, requesterUserId);
    const s = (server as any).interactionSettings ?? {};
    return {
      systemMessagesEnabled: s.systemMessagesEnabled ?? true,
      welcomeMessageEnabled: s.welcomeMessageEnabled ?? true,
      stickerReplyWelcomeEnabled: s.stickerReplyWelcomeEnabled ?? true,
      defaultNotificationLevel:
        s.defaultNotificationLevel === 'mentions' ? 'mentions' : 'all',
      systemChannelId: s.systemChannelId ? s.systemChannelId.toString() : null,
      canEdit,
    };
  }

  async updateInteractionSettings(
    serverId: string,
    userId: string,
    payload: {
      systemMessagesEnabled?: boolean;
      welcomeMessageEnabled?: boolean;
      stickerReplyWelcomeEnabled?: boolean;
      defaultNotificationLevel?: 'all' | 'mentions';
      systemChannelId?: string | null;
    },
  ): Promise<{
    systemMessagesEnabled: boolean;
    welcomeMessageEnabled: boolean;
    stickerReplyWelcomeEnabled: boolean;
    defaultNotificationLevel: 'all' | 'mentions';
    systemChannelId: string | null;
    canEdit: boolean;
  }> {
    await this.assertCanManageServer(serverId, userId);
    const server = await this.serverModel.findById(serverId).exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    const next = {
      ...(server as any).interactionSettings,
    };

    if (payload.systemMessagesEnabled !== undefined) {
      next.systemMessagesEnabled = Boolean(payload.systemMessagesEnabled);
    }
    if (payload.welcomeMessageEnabled !== undefined) {
      next.welcomeMessageEnabled = Boolean(payload.welcomeMessageEnabled);
    }
    if (payload.stickerReplyWelcomeEnabled !== undefined) {
      next.stickerReplyWelcomeEnabled = Boolean(
        payload.stickerReplyWelcomeEnabled,
      );
    }
    if (payload.defaultNotificationLevel !== undefined) {
      next.defaultNotificationLevel =
        payload.defaultNotificationLevel === 'mentions' ? 'mentions' : 'all';
    }
    if (payload.systemChannelId !== undefined) {
      next.systemChannelId = payload.systemChannelId
        ? new Types.ObjectId(payload.systemChannelId)
        : null;
    }

    (server as any).interactionSettings = next;
    await server.save();
    return this.getInteractionSettings(serverId, userId);
  }

  async createRoleNotification(
    serverId: string,
    actorId: string,
    payload: {
      title: string;
      content: string;
      targetType: 'everyone' | 'role';
      roleId?: string | null;
    },
  ): Promise<{ success: boolean; recipients: number; notificationId: string }> {
    await this.assertCanManageServer(serverId, actorId);
    const server = await this.serverModel.findById(serverId).exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    const title = payload.title?.trim?.() ?? '';
    const content = payload.content?.trim?.() ?? '';
    if (!title || !content) {
      throw new BadRequestException('title và content là bắt buộc');
    }

    let recipients: Types.ObjectId[] = [];
    let targetRoleName: string | null = null;
    let targetRoleObjectId: Types.ObjectId | null = null;

    if (payload.targetType === 'everyone') {
      recipients = server.members.map((m) => new Types.ObjectId(m.userId));
      targetRoleName = '@everyone';
    } else {
      if (!payload.roleId) {
        throw new BadRequestException('roleId là bắt buộc khi targetType=role');
      }
      const role = await this.rolesService.getRoleById(
        serverId,
        payload.roleId,
      );
      targetRoleName = role.name;
      targetRoleObjectId = new Types.ObjectId(role._id as any);
      recipients = role.isDefault
        ? server.members.map((m) => new Types.ObjectId(m.userId))
        : role.memberIds.map((id) => new Types.ObjectId(id));
    }

    const uniqueRecipientIds = Array.from(
      new Set(recipients.map((id) => id.toString())),
    ).map((id) => new Types.ObjectId(id));

    const notification = await this.serverNotificationModel.create({
      serverId: new Types.ObjectId(serverId),
      createdBy: new Types.ObjectId(actorId),
      title,
      content,
      targetType: payload.targetType,
      targetRoleId: targetRoleObjectId,
      targetRoleName,
      recipientUserIds: uniqueRecipientIds,
    });

    return {
      success: true,
      recipients: uniqueRecipientIds.length,
      notificationId: notification._id.toString(),
    };
  }

  async getForYouRoleNotifications(userId: string): Promise<
    Array<{
      type: 'server_notification';
      _id: string;
      serverId: string;
      serverName: string;
      serverAvatarUrl?: string | null;
      title: string;
      content: string;
      targetRoleName?: string | null;
      createdAt: string;
    }>
  > {
    const docs = await this.serverNotificationModel
      .find({ recipientUserIds: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
      .exec();

    if (!docs.length) return [];
    const serverIds = Array.from(
      new Set(docs.map((d: any) => d.serverId.toString())),
    ).map((id) => new Types.ObjectId(id));
    const servers = await this.serverModel
      .find({ _id: { $in: serverIds } })
      .select('_id name avatarUrl')
      .lean()
      .exec();
    const serverMap = new Map(
      (servers as any[]).map((s) => [s._id.toString(), s]),
    );

    return (docs as any[]).map((d) => {
      const server = serverMap.get(d.serverId.toString());
      return {
        type: 'server_notification' as const,
        _id: d._id.toString(),
        serverId: d.serverId.toString(),
        serverName: server?.name?.trim?.() ?? '',
        serverAvatarUrl: server?.avatarUrl ?? null,
        title: d.title ?? '',
        content: d.content ?? '',
        targetRoleName: d.targetRoleName ?? null,
        createdAt: d.createdAt?.toISOString?.() ?? new Date().toISOString(),
      };
    });
  }

  /**
   * Lấy permissions của user hiện tại trong server
   * Trả về các quyền dựa trên roles của user
   */
  async getCurrentUserPermissions(
    serverId: string,
    userId: string,
  ): Promise<{
    isOwner: boolean;
    hasCustomRole: boolean; // User có vai trò nào ngoài @everyone không
    canKick: boolean;
    canBan: boolean;
    canTimeout: boolean;
    canManageServer: boolean;
    canManageChannels: boolean;
    canManageEvents: boolean;
    canCreateInvite: boolean;
    mentionEveryone: boolean;
  }> {
    const server = await this.serverModel.findById(serverId).exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    // Kiểm tra có phải member không
    const isMember = server.members.some((m) => m.userId.toString() === userId);
    if (!isMember) {
      throw new ForbiddenException('Bạn không phải thành viên của server này');
    }

    const isOwner = server.ownerId.toString() === userId;

    // Kiểm tra user có vai trò nào ngoài @everyone không
    const memberRoles = await this.rolesService.getMemberRoles(
      serverId,
      userId,
    );
    const hasCustomRole = memberRoles.some((r) => !r.isDefault);

    // Owner có tất cả quyền
    if (isOwner) {
      return {
        isOwner: true,
        hasCustomRole: true, // Owner luôn có quyền
        canKick: true,
        canBan: true,
        canTimeout: true,
        canManageServer: true,
        canManageChannels: true,
        canManageEvents: true,
        canCreateInvite: true,
        mentionEveryone: true,
      };
    }

    // Lấy permissions từ roles
    const permissions = await this.rolesService.calculateMemberPermissions(
      serverId,
      userId,
    );

    return {
      isOwner: false,
      hasCustomRole,
      canKick: permissions.kickMembers,
      canBan: permissions.banMembers,
      canTimeout: permissions.timeoutMembers,
      canManageServer: permissions.manageServer,
      canManageChannels: permissions.manageChannels,
      canManageEvents: permissions.manageEvents,
      canCreateInvite: permissions.createInvite,
      mentionEveryone: Boolean(permissions.mentionEveryone),
    };
  }

  // =====================================================
  // PUBLIC MEMBER LIST WITH ROLE INFO
  // =====================================================

  /**
   * Bổ sung account age, activity (tin nhắn 10 phút / 30 ngày), last message, online (device),
   * join method — dùng cho tab Thành viên (search/filter/sort/flags).
   */
  private async enrichMembersListForUi(
    serverId: string,
    server: Server,
    membersResult: Array<{
      userId: string;
      displayName: string;
      username: string;
      avatarUrl: string;
      joinedAt: Date;
      isOwner: boolean;
      serverMemberRole: 'owner' | 'moderator' | 'member';
      roles: Array<{
        _id: string;
        name: string;
        color: string;
        position: number;
      }>;
      highestRolePosition: number;
      displayColor: string;
    }>,
  ): Promise<
    Array<{
      userId: string;
      displayName: string;
      username: string;
      avatarUrl: string;
      joinedAt: Date;
      isOwner: boolean;
      serverMemberRole: 'owner' | 'moderator' | 'member';
      roles: Array<{
        _id: string;
        name: string;
        color: string;
        position: number;
      }>;
      highestRolePosition: number;
      displayColor: string;
      accountCreatedAt: Date;
      accountAgeDays: number;
      messagesLast10Min: number;
      messagesLast30d: number;
      lastMessageAt: Date | null;
      isOnline: boolean;
      joinMethod: 'owner' | 'invited' | 'link';
      invitedBy?: { id: string; username: string };
    }>
  > {
    const now = Date.now();
    const userObjectIds = membersResult.map(
      (m) => new Types.ObjectId(m.userId),
    );

    const users = await this.userModel
      .find({ _id: { $in: userObjectIds } })
      .select('createdAt loginDevices settings')
      .lean()
      .exec();
    const userById = new Map(
      users.map((u: any) => [
        u._id.toString(),
        u as {
          createdAt?: Date;
          loginDevices?: Array<{ lastSeenAt?: Date }>;
          settings?: { sharePresence?: boolean };
        },
      ]),
    );

    const channelIds = ((server as any).channels ?? []) as Types.ObjectId[];
    const tenMinAgo = new Date(now - 10 * 60 * 1000);
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    /** Hoạt động thiết bị: 30 phút — tránh offline nhầm khi app không gửi lastSeen thường xuyên. */
    const devicePresenceAgo = new Date(now - 30 * 60 * 1000);
    /** Tin nhắn gần nhất trên server (trong 30 ngày agg) — nếu trong 15 phút thì coi như đang dùng kênh. */
    const recentMessageAgo = new Date(now - 15 * 60 * 1000);

    const msgStats = new Map<
      string,
      { count30: number; count10: number; lastAt: Date | null }
    >();
    if (channelIds.length > 0) {
      const agg = await this.messageModel
        .aggregate([
          {
            $match: {
              channelId: { $in: channelIds },
              senderId: { $in: userObjectIds },
              createdAt: { $gte: thirtyDaysAgo },
            },
          },
          {
            $group: {
              _id: '$senderId',
              count30: { $sum: 1 },
              lastAt: { $max: '$createdAt' },
              count10: {
                $sum: {
                  $cond: [{ $gte: ['$createdAt', tenMinAgo] }, 1, 0],
                },
              },
            },
          },
        ])
        .exec();
      for (const row of agg) {
        const uid = row._id.toString();
        msgStats.set(uid, {
          count30: row.count30 ?? 0,
          count10: row.count10 ?? 0,
          lastAt: row.lastAt ? new Date(row.lastAt) : null,
        });
      }
    }

    const serverOid = new Types.ObjectId(serverId);
    const acceptedInvites = await this.serverInviteModel
      .find({
        serverId: serverOid,
        status: 'accepted',
        toUserId: { $in: userObjectIds },
      })
      .populate('fromUserId', '_id')
      .lean()
      .exec();
    const inviteByToId = new Map<
      string,
      { fromUserId: string; fromUsername?: string }
    >();
    const inviterIds = [
      ...new Set(
        (acceptedInvites as any[]).map((inv) => {
          const from = inv.fromUserId;
          return (from?._id ?? from)?.toString();
        }),
      ),
    ].filter(Boolean);
    if (inviterIds.length > 0) {
      const inviterProfiles = await this.profileModel
        .find({
          userId: { $in: inviterIds.map((id) => new Types.ObjectId(id)) },
        })
        .select('userId username')
        .lean()
        .exec();
      const inviterMap = new Map(
        inviterProfiles.map((p: any) => [p.userId.toString(), p.username]),
      );
      for (const inv of acceptedInvites as any[]) {
        const toId = (inv.toUserId?._id ?? inv.toUserId)?.toString();
        const fromId = (inv.fromUserId?._id ?? inv.fromUserId)?.toString();
        if (toId && fromId) {
          inviteByToId.set(toId, {
            fromUserId: fromId,
            fromUsername: inviterMap.get(fromId),
          });
        }
      }
    }

    return membersResult.map((row) => {
      const u = userById.get(row.userId);
      const created = u?.createdAt ? new Date(u.createdAt) : row.joinedAt;
      const ageDays = Math.floor(
        (now - created.getTime()) / (24 * 60 * 60 * 1000),
      );
      const stats = msgStats.get(row.userId);
      let lastDevice = 0;
      if (u?.loginDevices?.length) {
        for (const d of u.loginDevices) {
          if (d?.lastSeenAt) {
            lastDevice = Math.max(lastDevice, new Date(d.lastSeenAt).getTime());
          }
        }
      }
      const deviceOnline =
        lastDevice > 0 && lastDevice >= devicePresenceAgo.getTime();
      /** Có tin trên server trong 10 phút → coi như đang hoạt động trên máy chủ. */
      const activeInServer = (stats?.count10 ?? 0) > 0;
      const lastMsgMs = stats?.lastAt ? new Date(stats.lastAt).getTime() : 0;
      const recentlyMessaged =
        lastMsgMs > 0 && lastMsgMs >= recentMessageAgo.getTime();
      const sharePresence = u?.settings?.sharePresence !== false;
      const isOnline =
        sharePresence && (deviceOnline || activeInServer || recentlyMessaged);

      let joinMethod: 'owner' | 'invited' | 'link' = 'link';
      let invitedBy: { id: string; username: string } | undefined;
      if (row.isOwner) {
        joinMethod = 'owner';
      } else {
        const inv = inviteByToId.get(row.userId);
        if (inv) {
          joinMethod = 'invited';
          invitedBy = {
            id: inv.fromUserId,
            username: inv.fromUsername ?? 'Người dùng',
          };
        }
      }

      return {
        ...row,
        accountCreatedAt: created,
        accountAgeDays: ageDays,
        messagesLast10Min: stats?.count10 ?? 0,
        messagesLast30d: stats?.count30 ?? 0,
        lastMessageAt: stats?.lastAt ?? null,
        isOnline,
        joinMethod,
        invitedBy,
      };
    });
  }

  /**
   * Lấy danh sách thành viên với thông tin role (PUBLIC - cho tất cả members)
   * Trả về: thông tin cơ bản + roles + màu hiển thị + quyền của user hiện tại
   */
  async getServerMembersWithRoles(
    serverId: string,
    requesterUserId: string,
  ): Promise<{
    members: Array<{
      userId: string;
      nickname?: string | null;
      displayName: string;
      username: string;
      avatarUrl: string;
      coverUrl?: string | null;
      joinedAt: Date;
      isOwner: boolean;
      serverMemberRole: 'owner' | 'moderator' | 'member';
      roles: Array<{
        _id: string;
        name: string;
        color: string;
        position: number;
      }>;
      highestRolePosition: number;
      displayColor: string;
      accountCreatedAt: Date;
      accountAgeDays: number;
      messagesLast10Min: number;
      messagesLast30d: number;
      lastMessageAt: Date | null;
      isOnline: boolean;
      joinMethod: 'owner' | 'invited' | 'link';
      invitedBy?: { id: string; username: string };
    }>;
    currentUserPermissions: {
      canKick: boolean;
      canBan: boolean;
      canTimeout: boolean;
      isOwner: boolean;
    };
  }> {
    const server = await this.serverModel.findById(serverId).exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    await this.ensureOwnerMemberRow(server);

    // Kiểm tra người yêu cầu có phải member không
    const isMember = server.members.some(
      (m) => m.userId.toString() === requesterUserId,
    );
    if (!isMember) {
      throw new ForbiddenException('Bạn không phải thành viên của server này');
    }

    const userIds = server.members.map((m) => m.userId);

    // Lấy profiles
    const profiles = await this.profileModel
      .find({ userId: { $in: userIds } })
      .select('userId displayName username avatarUrl')
      .lean()
      .exec();
    const profileByUserId = new Map(
      profiles.map((p: any) => [p.userId.toString(), p]),
    );

    const userServerRows = await this.userServerModel
      .find({
        serverId: new Types.ObjectId(serverId),
        userId: { $in: userIds },
      })
      .select('userId serverAvatarUrl serverCoverUrl')
      .lean()
      .exec();
    const userServerByUserId = new Map(
      (userServerRows as any[]).map((r) => [r.userId.toString(), r]),
    );

    // Lấy thông tin role cho từng member
    const membersResult: Array<{
      userId: string;
      nickname?: string | null;
      displayName: string;
      username: string;
      avatarUrl: string;
      coverUrl?: string | null;
      joinedAt: Date;
      isOwner: boolean;
      serverMemberRole: 'owner' | 'moderator' | 'member';
      roles: Array<{
        _id: string;
        name: string;
        color: string;
        position: number;
      }>;
      highestRolePosition: number;
      displayColor: string;
    }> = [];

    for (const m of server.members) {
      const uid = m.userId.toString();
      const profile = profileByUserId.get(uid) as
        | { displayName: string; username: string; avatarUrl: string }
        | undefined;
      const us = userServerByUserId.get(uid) as
        | { serverAvatarUrl?: string | null; serverCoverUrl?: string | null }
        | undefined;

      // Lấy role info cho member này
      const roleInfo = await this.rolesService.getMemberRoleInfo(serverId, uid);

      membersResult.push({
        userId: uid,
        nickname: (m as any)?.nickname ?? null,
        displayName: profile?.displayName ?? 'Người dùng',
        username: profile?.username ?? uid,
        avatarUrl: us?.serverAvatarUrl || profile?.avatarUrl || '',
        coverUrl: us?.serverCoverUrl ?? null,
        joinedAt:
          m.joinedAt instanceof Date ? m.joinedAt : new Date(m.joinedAt),
        isOwner: server.ownerId.toString() === uid,
        serverMemberRole: m.role,
        roles: roleInfo.roles,
        highestRolePosition: roleInfo.highestRole?.position ?? 0,
        displayColor: roleInfo.displayColor,
      });
    }

    // Sắp xếp members theo role position (cao nhất lên trước)
    membersResult.sort((a, b) => {
      if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
      return b.highestRolePosition - a.highestRolePosition;
    });

    const enriched = await this.enrichMembersListForUi(
      serverId,
      server,
      membersResult,
    );

    // Lấy quyền của user hiện tại
    const isOwner = server.ownerId.toString() === requesterUserId;
    const [canKick, canBan, canTimeout] = await Promise.all([
      this.rolesService.hasPermission(serverId, requesterUserId, 'kickMembers'),
      this.rolesService.hasPermission(serverId, requesterUserId, 'banMembers'),
      this.rolesService.hasPermission(
        serverId,
        requesterUserId,
        'timeoutMembers',
      ),
    ]);

    return {
      members: enriched,
      currentUserPermissions: {
        canKick,
        canBan,
        canTimeout,
        isOwner,
      },
    };
  }

  // =====================================================
  // MODERATOR VIEW - MEMBER DETAIL
  // =====================================================

  /**
   * Moderator View: chi tiết 1 member cho panel bên phải
   */
  async getModeratorMemberDetail(
    serverId: string,
    targetUserId: string,
    requesterUserId: string,
  ): Promise<{
    basic: {
      userId: string;
      displayName: string;
      username: string;
      avatarUrl: string;
      joinedAt: Date;
      accountCreatedAt: Date;
      joinMethod: 'owner' | 'invited' | 'link';
      invitedBy?: { id: string; username: string };
    };
    activity: {
      messageCountLast30d: number;
      linkCountLast30d: number;
      mediaCountLast30d: number;
    };
    permissions: RolePermissions;
    roles: {
      assigned: Array<{
        _id: string;
        name: string;
        color: string;
        position: number;
      }>;
      allServerRoles: Array<{
        _id: string;
        name: string;
        color: string;
        position: number;
      }>;
    };
  }> {
    const server = await this.serverModel
      .findById(serverId)
      .select('ownerId members channels')
      .exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    const isMember = server.members.some(
      (m) => m.userId.toString() === requesterUserId,
    );
    if (!isMember) {
      throw new ForbiddenException('Bạn không phải thành viên của server này');
    }

    const isOwner = server.ownerId.toString() === requesterUserId;
    const canManageServer = await this.rolesService.hasPermission(
      serverId,
      requesterUserId,
      'manageServer',
    );
    const canKickMembers = await this.rolesService.hasPermission(
      serverId,
      requesterUserId,
      'kickMembers',
    );
    if (!isOwner && !canManageServer && !canKickMembers) {
      throw new ForbiddenException(
        'Chỉ owner hoặc thành viên có quyền quản lý/duyệt thành viên mới xem được Moderator View',
      );
    }

    const memberEntry = server.members.find(
      (m) => m.userId.toString() === targetUserId,
    );
    if (!memberEntry) {
      throw new NotFoundException('Thành viên không thuộc máy chủ này');
    }

    const user = await this.userModel
      .findById(memberEntry.userId)
      .select('_id createdAt')
      .lean()
      .exec();
    const profile = await this.profileModel
      .findOne({ userId: memberEntry.userId })
      .select('displayName username avatarUrl')
      .lean()
      .exec();

    const accountCreatedAt =
      user?.createdAt instanceof Date
        ? user.createdAt
        : user?.createdAt
          ? new Date(user.createdAt)
          : memberEntry.joinedAt instanceof Date
            ? memberEntry.joinedAt
            : new Date(memberEntry.joinedAt);
    const joinedAt =
      memberEntry.joinedAt instanceof Date
        ? memberEntry.joinedAt
        : new Date(memberEntry.joinedAt);

    // Join method + invitedBy tương tự summary
    const serverObjectId = new Types.ObjectId(serverId);
    const acceptedInvites = await this.serverInviteModel
      .find({
        serverId: serverObjectId,
        status: 'accepted',
        toUserId: memberEntry.userId,
      })
      .populate('fromUserId', '_id')
      .lean()
      .exec();

    let joinMethod: 'owner' | 'invited' | 'link' = 'link';
    let invitedBy: { id: string; username: string } | undefined;
    if (server.ownerId.toString() === targetUserId) {
      joinMethod = 'owner';
    } else if (acceptedInvites.length > 0) {
      joinMethod = 'invited';
      const inv = acceptedInvites[0] as any;
      const fromId = (inv.fromUserId?._id ?? inv.fromUserId)?.toString();
      if (fromId) {
        const inviterProfile = await this.profileModel
          .findOne({ userId: new Types.ObjectId(fromId) })
          .select('username')
          .lean()
          .exec();
        invitedBy = {
          id: fromId,
          username: inviterProfile?.username ?? 'Người dùng',
        };
      }
    }

    // Activity: thống kê 30 ngày gần nhất
    const channelIds = ((server as any).channels ?? []) as Types.ObjectId[];
    let messageCountLast30d = 0;
    let linkCountLast30d = 0;
    let mediaCountLast30d = 0;
    if (channelIds.length > 0) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const agg = await this.messageModel.aggregate([
        {
          $match: {
            channelId: { $in: channelIds },
            senderId: memberEntry.userId,
            createdAt: { $gte: thirtyDaysAgo },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            linkCount: {
              $sum: {
                $cond: [
                  {
                    $regexMatch: {
                      input: '$content',
                      regex: /https?:\/\//i,
                    },
                  },
                  1,
                  0,
                ],
              },
            },
            mediaCount: {
              $sum: {
                $cond: [
                  {
                    $gt: [{ $size: { $ifNull: ['$attachments', []] } }, 0],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]);
      if (agg.length > 0) {
        const row = agg[0];
        messageCountLast30d = row.total ?? 0;
        linkCountLast30d = row.linkCount ?? 0;
        mediaCountLast30d = row.mediaCount ?? 0;
      }
    }

    // Permissions & roles
    const permissions = await this.rolesService.calculateMemberPermissions(
      serverId,
      targetUserId,
    );
    const memberRoleInfo = await this.rolesService.getMemberRoleInfo(
      serverId,
      targetUserId,
    );
    const allRoles = await this.rolesService.getRolesByServer(serverId);

    return {
      basic: {
        userId: targetUserId,
        displayName: profile?.displayName ?? 'Người dùng',
        username: profile?.username ?? targetUserId,
        avatarUrl: profile?.avatarUrl ?? '',
        joinedAt,
        accountCreatedAt,
        joinMethod,
        invitedBy,
      },
      activity: {
        messageCountLast30d,
        linkCountLast30d,
        mediaCountLast30d,
      },
      permissions,
      roles: {
        assigned: memberRoleInfo.roles,
        allServerRoles: allRoles.map((r) => ({
          _id: r._id.toString(),
          name: r.name,
          color: r.color,
          position: r.position,
        })),
      },
    };
  }

  // =====================================================
  // MODERATION ACTIONS (KICK, BAN, TIMEOUT)
  // =====================================================

  /**
   * Kick thành viên khỏi server
   * Yêu cầu: quyền kickMembers + role hierarchy cao hơn target
   */
  async kickMember(
    serverId: string,
    actorId: string,
    targetId: string,
    reason?: string,
  ): Promise<{ success: boolean; message: string }> {
    // Validate quyền và role hierarchy
    await this.rolesService.validateModerationAction(
      serverId,
      actorId,
      targetId,
      'kickMembers',
    );

    const server = await this.serverModel.findById(serverId).exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    // Xóa member khỏi server
    server.members = server.members.filter(
      (m) => m.userId.toString() !== targetId,
    );
    server.memberCount = server.members.length;
    await server.save();

    await this.cleanupAfterMemberRemoved(serverId, targetId);

    return {
      success: true,
      message: `Đã kick thành viên${reason ? `. Lý do: ${reason}` : ''}`,
    };
  }

  /**
   * Ban thành viên khỏi server (không cho tham gia lại)
   * Yêu cầu: quyền banMembers + role hierarchy cao hơn target
   */
  async banMember(
    serverId: string,
    actorId: string,
    targetId: string,
    reason?: string,
    deleteMessageDays?: number,
  ): Promise<{ success: boolean; message: string }> {
    // Validate quyền và role hierarchy
    await this.rolesService.validateModerationAction(
      serverId,
      actorId,
      targetId,
      'banMembers',
    );

    const server = await this.serverModel.findById(serverId).exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    // Thêm vào danh sách ban (nếu chưa có trường này, sẽ cần update schema)
    if (!server.bannedUsers) {
      server.bannedUsers = [];
    }

    // Kiểm tra đã ban chưa
    const alreadyBanned = server.bannedUsers.some(
      (b) => b.userId.toString() === targetId,
    );
    if (alreadyBanned) {
      throw new BadRequestException('Người dùng này đã bị ban');
    }

    server.bannedUsers.push({
      userId: new Types.ObjectId(targetId),
      bannedAt: new Date(),
      bannedBy: new Types.ObjectId(actorId),
      reason: reason || null,
    });

    // Xóa member khỏi server
    server.members = server.members.filter(
      (m) => m.userId.toString() !== targetId,
    );
    server.memberCount = server.members.length;
    await server.save();

    await this.cleanupAfterMemberRemoved(serverId, targetId);

    return {
      success: true,
      message: `Đã ban thành viên${reason ? `. Lý do: ${reason}` : ''}`,
    };
  }

  /**
   * Timeout (tạm khóa) thành viên trong khoảng thời gian
   * Yêu cầu: quyền timeoutMembers + role hierarchy cao hơn target
   */
  async timeoutMember(
    serverId: string,
    actorId: string,
    targetId: string,
    durationSeconds: number,
    reason?: string,
  ): Promise<{ success: boolean; message: string; timeoutUntil: Date }> {
    // Validate quyền và role hierarchy
    await this.rolesService.validateModerationAction(
      serverId,
      actorId,
      targetId,
      'timeoutMembers',
    );

    const server = await this.serverModel.findById(serverId).exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    // Tìm member và update timeout
    const memberIndex = server.members.findIndex(
      (m) => m.userId.toString() === targetId,
    );
    if (memberIndex === -1) {
      throw new BadRequestException('Người dùng không phải thành viên server');
    }

    const timeoutUntil = new Date(Date.now() + durationSeconds * 1000);
    server.members[memberIndex].timeoutUntil = timeoutUntil;
    await server.save();

    return {
      success: true,
      message: `Đã tạm khóa thành viên${reason ? `. Lý do: ${reason}` : ''}`,
      timeoutUntil,
    };
  }

  /**
   * Gỡ timeout cho thành viên
   */
  async removeTimeout(
    serverId: string,
    actorId: string,
    targetId: string,
  ): Promise<{ success: boolean; message: string }> {
    // Validate quyền
    await this.rolesService.validateModerationAction(
      serverId,
      actorId,
      targetId,
      'timeoutMembers',
    );

    const server = await this.serverModel.findById(serverId).exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    const memberIndex = server.members.findIndex(
      (m) => m.userId.toString() === targetId,
    );
    if (memberIndex === -1) {
      throw new BadRequestException('Người dùng không phải thành viên server');
    }

    server.members[memberIndex].timeoutUntil = null;
    await server.save();

    return {
      success: true,
      message: 'Đã gỡ tạm khóa cho thành viên',
    };
  }

  /**
   * Unban thành viên
   */
  async unbanMember(
    serverId: string,
    actorId: string,
    targetId: string,
  ): Promise<{ success: boolean; message: string }> {
    // Chỉ người có quyền ban mới có thể unban
    const hasBanPermission = await this.rolesService.hasPermission(
      serverId,
      actorId,
      'banMembers',
    );
    if (!hasBanPermission) {
      throw new ForbiddenException('Bạn không có quyền unban thành viên');
    }

    const server = await this.serverModel.findById(serverId).exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    if (!server.bannedUsers) {
      throw new BadRequestException('Người dùng này chưa bị ban');
    }

    const bannedIndex = server.bannedUsers.findIndex(
      (b) => b.userId.toString() === targetId,
    );
    if (bannedIndex === -1) {
      throw new BadRequestException('Người dùng này chưa bị ban');
    }

    server.bannedUsers.splice(bannedIndex, 1);
    await server.save();

    return {
      success: true,
      message: 'Đã gỡ ban cho thành viên',
    };
  }

  /**
   * Lấy danh sách người bị ban
   */
  async getBannedUsers(
    serverId: string,
    actorId: string,
  ): Promise<
    Array<{
      userId: string;
      username: string;
      displayName: string;
      avatarUrl: string;
      bannedAt: Date;
      reason: string | null;
    }>
  > {
    const hasBanPermission = await this.rolesService.hasPermission(
      serverId,
      actorId,
      'banMembers',
    );
    if (!hasBanPermission) {
      throw new ForbiddenException('Bạn không có quyền xem danh sách ban');
    }

    const server = await this.serverModel.findById(serverId).exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    if (!server.bannedUsers || server.bannedUsers.length === 0) {
      return [];
    }

    const bannedUserIds = server.bannedUsers.map((b) => b.userId);
    const profiles = await this.profileModel
      .find({ userId: { $in: bannedUserIds } })
      .select('userId displayName username avatarUrl')
      .lean()
      .exec();
    const profileMap = new Map(
      profiles.map((p: any) => [p.userId.toString(), p]),
    );

    return server.bannedUsers.map((b) => {
      const profile = profileMap.get(b.userId.toString());
      return {
        userId: b.userId.toString(),
        username: profile?.username ?? 'Người dùng',
        displayName: profile?.displayName ?? 'Người dùng',
        avatarUrl: profile?.avatarUrl ?? '',
        bannedAt: b.bannedAt,
        reason: b.reason,
      };
    });
  }

  /**
   * Kiểm tra user có bị ban không
   */
  async isUserBanned(serverId: string, userId: string): Promise<boolean> {
    const server = await this.serverModel.findById(serverId).exec();
    if (!server || !server.bannedUsers) return false;
    return server.bannedUsers.some((b) => b.userId.toString() === userId);
  }

  /**
   * Chuyển quyền sở hữu máy chủ: A (owner) chuyển cho B → B thành owner, A thành member.
   * Chỉ chủ hiện tại mới gọi được; newOwnerId phải là thành viên và không phải chủ hiện tại.
   */
  async transferOwnership(
    serverId: string,
    currentOwnerUserId: string,
    newOwnerId: string,
  ): Promise<Server> {
    const server = await this.serverModel.findById(serverId).exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }
    if (server.ownerId.toString() !== currentOwnerUserId) {
      throw new ForbiddenException(
        'Chỉ chủ máy chủ mới có thể chuyển quyền sở hữu',
      );
    }
    if (newOwnerId === currentOwnerUserId) {
      throw new BadRequestException('Không thể chuyển quyền cho chính mình');
    }
    const newOwnerObjectId = new Types.ObjectId(newOwnerId);
    const currentOwnerObjectId = new Types.ObjectId(currentOwnerUserId);
    const newOwnerMember = server.members.find(
      (m) => m.userId.toString() === newOwnerId,
    );
    if (!newOwnerMember) {
      throw new BadRequestException(
        'Người nhận phải là thành viên của máy chủ',
      );
    }

    server.ownerId = newOwnerObjectId;
    for (let i = 0; i < server.members.length; i++) {
      const m = server.members[i];
      if (m.userId.equals(currentOwnerObjectId)) {
        server.members[i].role = 'member';
      } else if (m.userId.equals(newOwnerObjectId)) {
        server.members[i].role = 'owner';
      }
    }
    await server.save();
    return server;
  }

  async getMentionRestrictedMembers(
    serverId: string,
    userId: string,
  ): Promise<
    Array<{
      userId: string;
      displayName: string;
      username: string;
      avatarUrl: string;
      mentionBlockedUntil: string | null;
      mentionRestricted: boolean;
    }>
  > {
    await this.assertCanManageServer(serverId, userId);
    const server = await this.serverModel.findById(serverId).lean().exec();
    if (!server)
      throw new NotFoundException(`Server with id ${serverId} not found`);

    const restricted = ((server as any).members || []).filter(
      (m: any) =>
        m.mentionRestricted ||
        (m.mentionBlockedUntil && new Date(m.mentionBlockedUntil) > new Date()),
    );
    if (!restricted.length) return [];

    const userIds = restricted.map((m: any) => new Types.ObjectId(m.userId));
    const profiles = await this.profileModel
      .find({ userId: { $in: userIds } })
      .select('userId displayName username avatarUrl')
      .lean()
      .exec();
    const profileMap = new Map(
      (profiles as any[]).map((p) => [p.userId.toString(), p]),
    );

    return restricted.map((m: any) => {
      const p = profileMap.get(m.userId.toString()) || {};
      return {
        userId: m.userId.toString(),
        displayName: p.displayName || 'Người dùng',
        username: p.username || '',
        avatarUrl: p.avatarUrl || '',
        mentionBlockedUntil: m.mentionBlockedUntil
          ? new Date(m.mentionBlockedUntil).toISOString()
          : null,
        mentionRestricted: !!m.mentionRestricted,
      };
    });
  }

  async unrestrictMember(
    serverId: string,
    actorId: string,
    memberId: string,
  ): Promise<void> {
    await this.assertCanManageServer(serverId, actorId);
    await this.serverModel.updateOne(
      {
        _id: new Types.ObjectId(serverId),
        'members.userId': new Types.ObjectId(memberId),
      },
      {
        $set: {
          'members.$.mentionRestricted': false,
          'members.$.mentionBlockedUntil': null,
        },
      },
    );
  }

  // =====================================================
  // Community Settings
  // =====================================================

  async getDiscoveryEligibility(serverId: string, userId: string) {
    const server = await this.serverModel
      .findById(serverId)
      .select('ownerId memberCount members createdAt communitySettings')
      .lean()
      .exec();
    if (!server)
      throw new NotFoundException(`Server with id ${serverId} not found`);

    const memberCount = Number(
      (server as any).memberCount ||
        ((server as any).members || []).length ||
        0,
    );
    const createdAt = new Date((server as any).createdAt || Date.now());
    const ageMinutes = Math.floor(
      (Date.now() - createdAt.getTime()) / (60 * 1000),
    );

    const minMembers = 3;
    const minAgeMinutes = 5;
    const minMembersToEvaluate = 2;

    const canEvaluate = memberCount >= minMembersToEvaluate;
    const hasEnoughMembers = memberCount >= minMembers;
    const isOldEnough = ageMinutes >= minAgeMinutes;

    const communityEnabled = Boolean(
      (server as any).communitySettings?.enabled,
    );

    const contentPassed = true;

    const checks = [
      {
        id: 'evaluate',
        label: canEvaluate
          ? 'Đủ Thành Viên Để Đánh Giá'
          : 'Các Số Liệu Về Hoạt Động Máy Chủ Đang Chờ Xử Lý',
        description: canEvaluate
          ? 'Máy chủ đã có đủ thành viên để bắt đầu đánh giá các điều kiện.'
          : `Chúng tôi không thể tính toán số liệu hoạt động máy chủ cho đến khi máy chủ có ít nhất ${minMembersToEvaluate} thành viên. Máy Chủ trong Khám Phá phải đáp ứng các yêu cầu nhất định về hoạt động.`,
        passed: canEvaluate,
        warning: !canEvaluate,
      },
      {
        id: 'members',
        label: hasEnoughMembers
          ? `Hơn ${minMembers} Thành Viên`
          : `Ít Hơn ${minMembers} Thành Viên`,
        description: `Máy chủ của bạn cần có ít nhất ${minMembers} thành viên để đạt điều kiện.`,
        passed: hasEnoughMembers,
      },
      {
        id: 'age',
        label: isOldEnough ? 'Máy Chủ Đủ Tuổi' : 'Máy Chủ "Quá Trẻ"',
        description: isOldEnough
          ? 'Máy chủ đã đủ tuổi để lên Khám Phá.'
          : `Máy chủ trong Khám Phá cần có tuổi thọ ít nhất là ${minAgeMinutes} phút. Vui lòng kiểm tra lại sau.`,
        passed: isOldEnough,
      },
      {
        id: 'content',
        label: 'Không Có Nội Dung Xấu',
        description: contentPassed
          ? 'Tài nguyên máy chủ của bạn có vẻ phù hợp với Khám Phá!'
          : 'Máy chủ của bạn đã vi phạm Điều Khoản Dịch Vụ hoặc Nguyên Tắc Máy Chủ Cộng Đồng của chúng tôi.',
        passed: contentPassed,
      },
    ];

    const allPassed = checks.every((c) => c.passed);

    return {
      eligible: allPassed,
      communityEnabled,
      memberCount,
      serverAgeMinutes: ageMinutes,
      checks,
    };
  }

  async listExploreServers() {
    const servers = await this.serverModel
      .find({
        'communitySettings.enabled': true,
        communityDiscoveryStatus: 'approved',
        isActive: true,
      })
      .select(
        'name description avatarUrl bannerUrl bannerImageUrl bannerColor memberCount accessMode isPublic',
      )
      .lean()
      .exec();

    return servers.map((s: any) => ({
      id: String(s._id),
      name: s.name,
      description: s.description ?? null,
      avatarUrl: s.avatarUrl ?? null,
      bannerUrl: s.bannerUrl ?? null,
      bannerImageUrl: s.bannerImageUrl ?? null,
      bannerColor: s.bannerColor ?? null,
      memberCount: s.memberCount ?? 0,
      accessMode: s.accessMode ?? 'discoverable',
      isPublic: Boolean(s.isPublic),
    }));
  }

  async getCommunitySettings(serverId: string, userId: string) {
    const server = await this.serverModel
      .findById(serverId)
      .select('ownerId communitySettings')
      .lean()
      .exec();
    if (!server)
      throw new NotFoundException(`Server with id ${serverId} not found`);
    const isOwner = (server as any).ownerId?.toString() === userId;
    const canManage =
      isOwner ||
      (await this.rolesService.hasPermission(serverId, userId, 'manageServer'));
    if (!canManage)
      throw new ForbiddenException('Bạn không có quyền xem cài đặt cộng đồng');
    return (
      (server as any).communitySettings || {
        enabled: false,
        rulesChannelId: null,
        updatesChannelId: null,
        activatedAt: null,
      }
    );
  }

  async activateCommunity(
    serverId: string,
    userId: string,
    body: {
      rulesChannelId?: string | null;
      updatesChannelId?: string | null;
      createRulesChannel?: boolean;
      createUpdatesChannel?: boolean;
    },
  ) {
    const server = await this.serverModel.findById(serverId).exec();
    if (!server)
      throw new NotFoundException(`Server with id ${serverId} not found`);
    if ((server as any).ownerId?.toString() !== userId)
      throw new ForbiddenException(
        'Chỉ chủ máy chủ mới có thể kích hoạt cộng đồng',
      );

    let rulesChannelId = body.rulesChannelId || null;
    let updatesChannelId = body.updatesChannelId || null;
    let updatesTargetCategoryId: Types.ObjectId | null = null;

    const pickUpdatesTargetCategoryId =
      async (): Promise<Types.ObjectId | null> => {
        const firstTextWithCategory = await this.channelModel
          .findOne({
            serverId: new Types.ObjectId(serverId),
            type: 'text',
            category: { $ne: 'info' },
            categoryId: { $ne: null },
          })
          .sort({ position: 1 })
          .select('categoryId')
          .lean()
          .exec();
        const raw = (firstTextWithCategory as any)?.categoryId;
        return raw ? new Types.ObjectId(raw) : null;
      };

    if (body.createRulesChannel) {
      const ch = await this.channelModel.create({
        // Canonical slug; UI localises via translateChannelName (system-names.ts)
        name: 'server-rules',
        type: 'text',
        serverId: new Types.ObjectId(serverId),
        createdBy: new Types.ObjectId(userId),
        isDefault: false,
        isPrivate: false,
        isRulesChannel: true,
        position: 0,
      });
      rulesChannelId = (ch as any)._id.toString();
      server.channels.push((ch as any)._id);
    } else if (rulesChannelId) {
      await this.channelModel.updateMany(
        { serverId: new Types.ObjectId(serverId), isRulesChannel: true },
        { $set: { isRulesChannel: false } },
      );
      await this.channelModel.updateOne(
        { _id: new Types.ObjectId(rulesChannelId) },
        { $set: { isRulesChannel: true } },
      );
    }

    if (body.createUpdatesChannel) {
      updatesTargetCategoryId = await pickUpdatesTargetCategoryId();
      if (updatesTargetCategoryId) {
        await this.channelModel.updateMany(
          {
            serverId: new Types.ObjectId(serverId),
            type: 'text',
            categoryId: updatesTargetCategoryId,
          },
          { $inc: { position: 1 } },
        );
      }
      const ch = await this.channelModel.create({
        name: 'community-updates',
        type: 'text',
        serverId: new Types.ObjectId(serverId),
        createdBy: new Types.ObjectId(userId),
        isDefault: false,
        isPrivate: false,
        categoryId: updatesTargetCategoryId,
        position: 0,
      });
      updatesChannelId = (ch as any)._id.toString();
      server.channels.push((ch as any)._id);
    }

    // Create "Kênh khác" category for private channels
    const privateChannels = await this.channelModel
      .find({
        serverId: new Types.ObjectId(serverId),
        isPrivate: true,
      })
      .select('_id')
      .lean()
      .exec();

    if (privateChannels.length > 0) {
      const maxPos = await this.channelCategoryModel
        .findOne({ serverId: new Types.ObjectId(serverId) })
        .sort({ position: -1 })
        .select('position')
        .lean();
      const nextPosition = ((maxPos as any)?.position ?? -1) + 1;

      const otherCat = await this.channelCategoryModel.create({
        name: 'Kênh khác',
        serverId: new Types.ObjectId(serverId),
        position: nextPosition,
        type: 'mixed',
      });

      await this.channelModel.updateMany(
        {
          _id: { $in: privateChannels.map((c: any) => c._id) },
        },
        { $set: { categoryId: (otherCat as any)._id } },
      );
    }

    await this.serverModel.findByIdAndUpdate(serverId, {
      $set: {
        'communitySettings.enabled': true,
        'communitySettings.rulesChannelId': rulesChannelId,
        'communitySettings.updatesChannelId': updatesChannelId,
        'communitySettings.activatedAt': new Date(),
        'safetySettings.spamProtection.verificationLevel': 'high',
        'safetySettings.contentFilter.level': 'all_members',
      },
    });

    return {
      enabled: true,
      rulesChannelId,
      updatesChannelId,
      activatedAt: new Date(),
    };
  }

  async updateCommunityOverview(
    serverId: string,
    userId: string,
    body: {
      rulesChannelId?: string | null;
      primaryLanguage?: 'vi' | 'en';
      description?: string | null;
    },
  ) {
    const server = await this.serverModel.findById(serverId).exec();
    if (!server)
      throw new NotFoundException(`Server with id ${serverId} not found`);

    const isOwner = (server as any).ownerId?.toString() === userId;
    const canManage =
      isOwner ||
      (await this.rolesService.hasPermission(serverId, userId, 'manageServer'));
    if (!canManage)
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa tổng quan');

    if (typeof body.description !== 'undefined') {
      (server as any).description = body.description?.trim?.() || null;
    }
    if (typeof body.primaryLanguage !== 'undefined') {
      const lang = body.primaryLanguage;
      if (lang !== 'vi' && lang !== 'en') {
        throw new BadRequestException('Invalid primaryLanguage');
      }
      (server as any).primaryLanguage = lang;
    }

    if (typeof body.rulesChannelId !== 'undefined') {
      const rulesChannelId = body.rulesChannelId;
      (server as any).communitySettings = (server as any).communitySettings || {
        enabled: false,
        rulesChannelId: null,
        updatesChannelId: null,
        activatedAt: null,
      };
      (server as any).communitySettings.rulesChannelId = rulesChannelId || null;

      if (rulesChannelId) {
        await this.channelModel.updateMany(
          { serverId: new Types.ObjectId(serverId), isRulesChannel: true },
          { $set: { isRulesChannel: false } },
        );
        await this.channelModel.updateOne(
          { _id: new Types.ObjectId(rulesChannelId) },
          { $set: { isRulesChannel: true } },
        );
      }
    }

    await server.save();
    return {
      ok: true,
      description: (server as any).description ?? null,
      primaryLanguage: (server as any).primaryLanguage ?? 'vi',
      rulesChannelId: (server as any).communitySettings?.rulesChannelId ?? null,
    };
  }

  /**
   * Dữ liệu sticker máy chủ cho picker: mọi server user tham gia có sticker;
   * locked = true khi không phải server ngữ cảnh chat hiện tại.
   */
  async getStickerPickerData(
    userId: string,
    contextServerId?: string,
  ): Promise<{
    contextServerId: string | null;
    groups: Array<{
      serverId: string;
      serverName: string;
      serverAvatarUrl: string | null;
      locked: boolean;
      stickers: Array<{
        id: string;
        imageUrl: string;
        name: string;
        animated: boolean;
        addedBy: {
          displayName: string;
          username: string;
          avatarUrl: string;
        };
      }>;
    }>;
  }> {
    const boost = await this.boostService.getBoostStatus(userId);
    const hasBoost = Boolean(boost?.active);

    const userObjectId = new Types.ObjectId(userId);
    const servers = await this.serverModel
      .find({ 'members.userId': userObjectId })
      .select('_id name avatarUrl customStickers')
      .lean()
      .exec();

    const userIdsNeedingProfile = new Set<string>();
    for (const s of servers) {
      for (const st of (s as any).customStickers || []) {
        if (st.addedByUserId)
          userIdsNeedingProfile.add(String(st.addedByUserId));
      }
    }
    const profileList =
      userIdsNeedingProfile.size === 0
        ? []
        : await this.profileModel
            .find({
              userId: {
                $in: [...userIdsNeedingProfile].map(
                  (id) => new Types.ObjectId(id),
                ),
              },
            })
            .select('userId displayName username avatarUrl')
            .lean()
            .exec();
    const profileByUserId = new Map(
      profileList.map((p: any) => [String(p.userId), p]),
    );

    const ctx = (contextServerId || '').trim();
    const groups: Array<{
      serverId: string;
      serverName: string;
      serverAvatarUrl: string | null;
      locked: boolean;
      stickers: Array<{
        id: string;
        imageUrl: string;
        name: string;
        animated: boolean;
        addedBy: {
          displayName: string;
          username: string;
          avatarUrl: string;
        };
      }>;
    }> = [];

    for (const s of servers) {
      const stickersRaw = (s as any).customStickers || [];
      if (!Array.isArray(stickersRaw) || stickersRaw.length === 0) continue;
      const locked = ctx
        ? String(s._id) !== ctx && !hasBoost
        : !hasBoost;
      const stickerOut = stickersRaw.map((st: any) => {
        const prof = profileByUserId.get(String(st.addedByUserId));
        return {
          id: st._id?.toString(),
          imageUrl: st.imageUrl,
          name: (st.name || '').trim(),
          animated: !!st.animated,
          addedBy: {
            displayName: prof?.displayName || '',
            username: prof?.username || '',
            avatarUrl: prof?.avatarUrl || '',
          },
        };
      });
      groups.push({
        serverId: String(s._id),
        serverName: (s as any).name || '',
        serverAvatarUrl: (s as any).avatarUrl ?? null,
        locked,
        stickers: stickerOut,
      });
    }

    groups.sort((a, b) => {
      if (a.locked !== b.locked) return a.locked ? 1 : -1;
      return (a.serverName || '').localeCompare(b.serverName || '', 'vi');
    });

    return { contextServerId: ctx || null, groups };
  }

  async addServerSticker(
    serverId: string,
    userId: string,
    dto: { imageUrl: string; name?: string; animated?: boolean },
  ): Promise<{
    sticker: { id: string; imageUrl: string; name: string; animated: boolean };
  }> {
    const server = await this.serverModel.findById(serverId).exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    const isOwner = (server as any).ownerId?.toString() === userId;
    const canManage =
      isOwner ||
      (await this.rolesService.hasPermission(serverId, userId, 'manageServer'));
    if (!canManage) {
      throw new ForbiddenException(
        'Bạn không có quyền thêm sticker cho máy chủ này',
      );
    }

    const url = dto.imageUrl?.trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      throw new BadRequestException('imageUrl không hợp lệ');
    }
    const name = (dto.name || '').trim().slice(0, 80);

    const list = (server as any).customStickers || [];
    if (list.length >= MAX_CUSTOM_STICKERS_PER_SERVER) {
      throw new BadRequestException(
        `Máy chủ đã đạt giới hạn ${MAX_CUSTOM_STICKERS_PER_SERVER} sticker tùy chỉnh. Nâng cấp máy chủ sẽ mở thêm ô (sắp có).`,
      );
    }

    const stickerDoc = {
      imageUrl: url,
      name,
      animated: dto.animated === true,
      addedByUserId: new Types.ObjectId(userId),
      addedAt: new Date(),
    };
    list.push(stickerDoc);
    (server as any).customStickers = list;
    await server.save();
    const added = (server as any).customStickers[
      (server as any).customStickers.length - 1
    ];
    return {
      sticker: {
        id: added._id.toString(),
        imageUrl: added.imageUrl,
        name: added.name || '',
        animated: !!added.animated,
      },
    };
  }

  async getEmojiPickerData(
    userId: string,
    contextServerId?: string,
  ): Promise<{
    contextServerId: string | null;
    groups: Array<{
      serverId: string;
      serverName: string;
      serverAvatarUrl: string | null;
      locked: boolean;
      emojis: Array<{
        id: string;
        imageUrl: string;
        name: string;
        animated: boolean;
        addedBy: {
          displayName: string;
          username: string;
          avatarUrl: string;
        };
      }>;
    }>;
  }> {
    const boost = await this.boostService.getBoostStatus(userId);
    const hasBoost = Boolean(boost?.active);

    const userObjectId = new Types.ObjectId(userId);
    const servers = await this.serverModel
      .find({ 'members.userId': userObjectId })
      .select('_id name avatarUrl customEmojis')
      .lean()
      .exec();

    const userIdsNeedingProfile = new Set<string>();
    for (const s of servers) {
      for (const em of (s as any).customEmojis || []) {
        if (em.addedByUserId)
          userIdsNeedingProfile.add(String(em.addedByUserId));
      }
    }
    const profileList =
      userIdsNeedingProfile.size === 0
        ? []
        : await this.profileModel
            .find({
              userId: {
                $in: [...userIdsNeedingProfile].map(
                  (id) => new Types.ObjectId(id),
                ),
              },
            })
            .select('userId displayName username avatarUrl')
            .lean()
            .exec();
    const profileByUserId = new Map(
      profileList.map((p: any) => [String(p.userId), p]),
    );

    const ctx = (contextServerId || '').trim();
    const groups: Array<{
      serverId: string;
      serverName: string;
      serverAvatarUrl: string | null;
      locked: boolean;
      emojis: Array<{
        id: string;
        imageUrl: string;
        name: string;
        animated: boolean;
        addedBy: {
          displayName: string;
          username: string;
          avatarUrl: string;
        };
      }>;
    }> = [];

    for (const s of servers) {
      const emojisRaw = (s as any).customEmojis || [];
      if (!Array.isArray(emojisRaw) || emojisRaw.length === 0) continue;
      const locked = ctx
        ? String(s._id) !== ctx && !hasBoost
        : !hasBoost;
      const emojiOut = emojisRaw.map((em: any) => {
        const prof = profileByUserId.get(String(em.addedByUserId));
        return {
          id: em._id?.toString(),
          imageUrl: em.imageUrl,
          name: (em.name || '').trim(),
          animated: !!em.animated,
          addedBy: {
            displayName: prof?.displayName || '',
            username: prof?.username || '',
            avatarUrl: prof?.avatarUrl || '',
          },
        };
      });
      groups.push({
        serverId: String(s._id),
        serverName: (s as any).name || '',
        serverAvatarUrl: (s as any).avatarUrl ?? null,
        locked,
        emojis: emojiOut,
      });
    }

    groups.sort((a, b) => {
      if (a.locked !== b.locked) return a.locked ? 1 : -1;
      return (a.serverName || '').localeCompare(b.serverName || '', 'vi');
    });

    return { contextServerId: ctx || null, groups };
  }

  /** Máy chủ mà user có quyền quản lý emoji + số slot còn lại (modal tải lên). */
  async getEmojiUploadTargets(userId: string): Promise<{
    targets: Array<{
      serverId: string;
      name: string;
      avatarUrl: string | null;
      count: number;
      max: number;
      remaining: number;
    }>;
  }> {
    const userObjectId = new Types.ObjectId(userId);
    const servers = await this.serverModel
      .find({ 'members.userId': userObjectId })
      .select('_id name avatarUrl customEmojis ownerId')
      .lean()
      .exec();

    const targets: Array<{
      serverId: string;
      name: string;
      avatarUrl: string | null;
      count: number;
      max: number;
      remaining: number;
    }> = [];

    for (const s of servers) {
      const sid = String(s._id);
      const isOwner = String((s as any).ownerId) === userId;
      const canManage =
        isOwner ||
        (await this.rolesService.hasPermission(sid, userId, 'manageServer'));
      if (!canManage) continue;

      const list = ((s as any).customEmojis || []) as any[];
      const count = list.length;
      targets.push({
        serverId: sid,
        name: (s as any).name || '',
        avatarUrl: (s as any).avatarUrl ?? null,
        count,
        max: MAX_CUSTOM_EMOJIS_PER_SERVER,
        remaining: Math.max(0, MAX_CUSTOM_EMOJIS_PER_SERVER - count),
      });
    }

    targets.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));

    return { targets };
  }

  /** Máy chủ mà user có quyền quản lý sticker + slot còn lại (tối đa 5, chưa tính boost). */
  async getStickerUploadTargets(userId: string): Promise<{
    targets: Array<{
      serverId: string;
      name: string;
      avatarUrl: string | null;
      count: number;
      max: number;
      remaining: number;
    }>;
  }> {
    const userObjectId = new Types.ObjectId(userId);
    const servers = await this.serverModel
      .find({ 'members.userId': userObjectId })
      .select('_id name avatarUrl customStickers ownerId')
      .lean()
      .exec();

    const targets: Array<{
      serverId: string;
      name: string;
      avatarUrl: string | null;
      count: number;
      max: number;
      remaining: number;
    }> = [];

    for (const s of servers) {
      const sid = String(s._id);
      const isOwner = String((s as any).ownerId) === userId;
      const canManage =
        isOwner ||
        (await this.rolesService.hasPermission(sid, userId, 'manageServer'));
      if (!canManage) continue;

      const list = ((s as any).customStickers || []) as any[];
      const count = list.length;
      targets.push({
        serverId: sid,
        name: (s as any).name || '',
        avatarUrl: (s as any).avatarUrl ?? null,
        count,
        max: MAX_CUSTOM_STICKERS_PER_SERVER,
        remaining: Math.max(0, MAX_CUSTOM_STICKERS_PER_SERVER - count),
      });
    }

    targets.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));

    return { targets };
  }

  async getServerEmojisManage(
    serverId: string,
    userId: string,
  ): Promise<{
    max: number;
    count: number;
    emojis: Array<{
      id: string;
      imageUrl: string;
      name: string;
      animated: boolean;
      addedBy: {
        displayName: string;
        username: string;
        avatarUrl: string;
      };
    }>;
  }> {
    const server = await this.serverModel.findById(serverId).exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    const isOwner = (server as any).ownerId?.toString() === userId;
    const canManage =
      isOwner ||
      (await this.rolesService.hasPermission(serverId, userId, 'manageServer'));
    if (!canManage) {
      throw new ForbiddenException(
        'Bạn không có quyền xem hoặc quản lý emoji máy chủ này',
      );
    }

    const list = ((server as any).customEmojis || []) as any[];
    const userIdsNeedingProfile = new Set(
      list.map((em) => String(em.addedByUserId)).filter(Boolean),
    );
    const profileList =
      userIdsNeedingProfile.size === 0
        ? []
        : await this.profileModel
            .find({
              userId: {
                $in: [...userIdsNeedingProfile].map(
                  (id) => new Types.ObjectId(id),
                ),
              },
            })
            .select('userId displayName username avatarUrl')
            .lean()
            .exec();
    const profileByUserId = new Map(
      profileList.map((p: any) => [String(p.userId), p]),
    );

    const sorted = [...list].sort((a, b) => {
      const ta = new Date(a.addedAt || 0).getTime();
      const tb = new Date(b.addedAt || 0).getTime();
      return tb - ta;
    });

    const emojis = sorted.map((em: any) => {
      const prof = profileByUserId.get(String(em.addedByUserId));
      return {
        id: em._id?.toString(),
        imageUrl: em.imageUrl,
        name: (em.name || '').trim(),
        animated: !!em.animated,
        addedBy: {
          displayName: prof?.displayName || '',
          username: prof?.username || '',
          avatarUrl: prof?.avatarUrl || '',
        },
      };
    });

    return {
      max: MAX_CUSTOM_EMOJIS_PER_SERVER,
      count: list.length,
      emojis,
    };
  }

  async getServerStickersManage(
    serverId: string,
    userId: string,
  ): Promise<{
    max: number;
    count: number;
    stickers: Array<{
      id: string;
      imageUrl: string;
      name: string;
      animated: boolean;
      addedBy: {
        displayName: string;
        username: string;
        avatarUrl: string;
      };
    }>;
  }> {
    const server = await this.serverModel.findById(serverId).exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    const isOwner = (server as any).ownerId?.toString() === userId;
    const canManage =
      isOwner ||
      (await this.rolesService.hasPermission(serverId, userId, 'manageServer'));
    if (!canManage) {
      throw new ForbiddenException(
        'Bạn không có quyền xem hoặc quản lý sticker máy chủ này',
      );
    }

    const list = ((server as any).customStickers || []) as any[];
    const userIdsNeedingProfile = new Set(
      list.map((st) => String(st.addedByUserId)).filter(Boolean),
    );
    const profileList =
      userIdsNeedingProfile.size === 0
        ? []
        : await this.profileModel
            .find({
              userId: {
                $in: [...userIdsNeedingProfile].map(
                  (id) => new Types.ObjectId(id),
                ),
              },
            })
            .select('userId displayName username avatarUrl')
            .lean()
            .exec();
    const profileByUserId = new Map(
      profileList.map((p: any) => [String(p.userId), p]),
    );

    const sorted = [...list].sort((a, b) => {
      const ta = new Date(a.addedAt || 0).getTime();
      const tb = new Date(b.addedAt || 0).getTime();
      return tb - ta;
    });

    const stickers = sorted.map((st: any) => {
      const prof = profileByUserId.get(String(st.addedByUserId));
      return {
        id: st._id?.toString(),
        imageUrl: st.imageUrl,
        name: (st.name || '').trim(),
        animated: !!st.animated,
        addedBy: {
          displayName: prof?.displayName || '',
          username: prof?.username || '',
          avatarUrl: prof?.avatarUrl || '',
        },
      };
    });

    return {
      max: MAX_CUSTOM_STICKERS_PER_SERVER,
      count: list.length,
      stickers,
    };
  }

  async addServerEmoji(
    serverId: string,
    userId: string,
    dto: AddServerEmojiDto,
  ): Promise<{
    emoji: { id: string; imageUrl: string; name: string; animated: boolean };
  }> {
    const server = await this.serverModel.findById(serverId).exec();
    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    const isOwner = (server as any).ownerId?.toString() === userId;
    const canManage =
      isOwner ||
      (await this.rolesService.hasPermission(serverId, userId, 'manageServer'));
    if (!canManage) {
      throw new ForbiddenException(
        'Bạn không có quyền thêm emoji cho máy chủ này',
      );
    }

    const url = dto.imageUrl?.trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      throw new BadRequestException('imageUrl không hợp lệ');
    }
    const name = (dto.name || '').trim().slice(0, 80);

    const list = (server as any).customEmojis || [];
    if (list.length >= MAX_CUSTOM_EMOJIS_PER_SERVER) {
      throw new BadRequestException(
        `Máy chủ đã đạt giới hạn ${MAX_CUSTOM_EMOJIS_PER_SERVER} emoji tùy chỉnh (tĩnh và GIF cộng dồn).`,
      );
    }

    const emojiDoc = {
      imageUrl: url,
      name,
      animated: dto.animated === true,
      addedByUserId: new Types.ObjectId(userId),
      addedAt: new Date(),
    };
    list.push(emojiDoc);
    (server as any).customEmojis = list;
    await server.save();
    const added = (server as any).customEmojis[
      (server as any).customEmojis.length - 1
    ];
    return {
      emoji: {
        id: added._id.toString(),
        imageUrl: added.imageUrl,
        name: added.name || '',
        animated: !!added.animated,
      },
    };
  }
}
