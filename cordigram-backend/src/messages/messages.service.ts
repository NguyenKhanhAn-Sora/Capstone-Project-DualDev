import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
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
import { MentionMuteService } from '../users/mention-mute.service';
import { RolesService } from '../roles/roles.service';
import { InboxSeen } from '../inbox/inbox-seen.schema';
import { UserServer } from '../access/user-server.schema';
import { User } from '../users/user.schema';
import {
  evaluateChannelChatGate,
  normalizeServerVerificationLevel,
  type ChatGateBlockReason,
} from './channel-chat-gate.util';
import { MediaModerationService } from '../posts/media-moderation.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import type { ContentFilterLevel } from '../servers/server.schema';
import { BoostService } from '../boost/boost.service';

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
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly ignoredService: IgnoredService,
    private readonly mentionMuteService: MentionMuteService,
    @Inject(forwardRef(() => RolesService))
    private readonly rolesService: RolesService,
    private readonly mediaModerationService: MediaModerationService,
    private readonly cloudinaryService: CloudinaryService,
    @Inject(forwardRef(() => BoostService))
    private readonly boostService: BoostService,
  ) {}

  private async handleMentionSpamViolation(
    server: any,
    userId: string,
    channelId: string,
    msf: any,
  ): Promise<void> {
    const responses = msf.responses || {};
    const serverId = server._id.toString();

    if (responses.blockMessage) {
      const blockHours = Number(msf.blockDurationHours || 8);
      await this.serverModel.updateOne(
        {
          _id: server._id,
          'members.userId': new Types.ObjectId(userId),
        },
        {
          $set: {
            'members.$.mentionBlockedUntil': new Date(
              Date.now() + blockHours * 3600000,
            ),
          },
        },
      );
    }

    if (responses.restrictMember) {
      await this.serverModel.updateOne(
        {
          _id: server._id,
          'members.userId': new Types.ObjectId(userId),
        },
        { $set: { 'members.$.mentionRestricted': true } },
      );
    }

    if (responses.sendWarning) {
      try {
        const serverDoc = await this.serverModel
          .findById(serverId)
          .select('name ownerId')
          .lean()
          .exec();
        const serverName = (serverDoc as any)?.name || 'Máy chủ';
        const notifContent = `__SYS:mentionSpamWarning:${serverName}`;
        const notifModel = this.serverModel.db.model('ServerNotification');
        await notifModel.create({
          serverId: new Types.ObjectId(serverId),
          createdBy: new Types.ObjectId(server.ownerId?.toString() ?? serverId),
          title: '__SYS:mentionSpamTitle',
          content: notifContent,
          targetType: 'role',
          targetRoleName: null,
          targetRoleId: null,
          recipientUserIds: [new Types.ObjectId(userId)],
        });
      } catch {
        /* non-critical */
      }
    }

    if (msf.customNotification) {
      try {
        const profile = await this.profileModel
          .findOne({ userId: new Types.ObjectId(userId) })
          .select('displayName username')
          .lean()
          .exec();
        const displayName =
          (profile as any)?.displayName ||
          (profile as any)?.username ||
          'Người dùng';
        const systemMsg = new this.messageModel({
          channelId: new Types.ObjectId(channelId),
          senderId: new Types.ObjectId(server.ownerId?.toString() ?? userId),
          content: `⚠️ @${displayName}: ${msf.customNotification}`,
          messageType: 'system',
          attachments: [],
          mentions: [new Types.ObjectId(userId)],
        });
        await systemMsg.save();
      } catch {
        /* non-critical */
      }
    }
  }

  private containsExternalLink(content: string): boolean {
    const urls = content.match(/https?:\/\/[^\s]+/gi) || [];
    if (urls.length === 0) return false;
    const whitelist = [
      'youtube.com',
      'youtu.be',
      'facebook.com',
      'google.com',
      'github.com',
      'discord.com',
      'discord.gg',
      'tiktok.com',
      'x.com',
      'twitter.com',
    ];
    return urls.some((u) => {
      try {
        const h = new URL(u).hostname.toLowerCase();
        return !whitelist.some((d) => h === d || h.endsWith(`.${d}`));
      } catch {
        return false;
      }
    });
  }

  private isImageUrl(url: string): boolean {
    try {
      const pathname = new URL(url).pathname.toLowerCase();
      return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/.test(pathname);
    } catch {
      return /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(url);
    }
  }

  private insertCloudinaryBlur(url: string): string | null {
    const match = url.match(
      /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(v\d+\/.+)$/,
    );
    if (match) return `${match[1]}e_blur:1800/${match[2]}`;
    return null;
  }

  private async moderateAttachments(attachments: string[]): Promise<string[]> {
    const result: string[] = [];

    for (const url of attachments) {
      if (!this.isImageUrl(url)) {
        result.push(url);
        continue;
      }

      try {
        const resp = await fetch(url);
        if (!resp.ok) {
          result.push(url);
          continue;
        }
        const buffer = Buffer.from(await resp.arrayBuffer());
        const modResult = await this.mediaModerationService.moderateImage({
          buffer,
          mimetype: resp.headers.get('content-type') || 'image/jpeg',
        });

        if (modResult.decision === 'reject') {
          continue;
        }

        if (modResult.decision === 'blur') {
          const blurred = this.insertCloudinaryBlur(url);
          result.push(blurred || url);
          continue;
        }

        result.push(url);
      } catch {
        result.push(url);
      }
    }

    return result;
  }

  private async moderateEmbeddedImages(
    content: string,
  ): Promise<{ content: string; decision: 'none' | 'blurred' | 'rejected' }> {
    const imagePattern = /📷 \[Image\]: (https?:\/\/[^\s]+)/g;
    let match: RegExpExecArray | null;
    let result = content;
    let decision: 'none' | 'blurred' | 'rejected' = 'none';

    const matches: { full: string; url: string }[] = [];
    while ((match = imagePattern.exec(content)) !== null) {
      matches.push({ full: match[0], url: match[1] });
    }

    for (const m of matches) {
      try {
        const resp = await fetch(m.url);
        if (!resp.ok) continue;
        const buffer = Buffer.from(await resp.arrayBuffer());
        const modResult = await this.mediaModerationService.moderateImage({
          buffer,
          mimetype: resp.headers.get('content-type') || 'image/jpeg',
        });

        if (modResult.decision === 'reject') {
          result = result.replace(
            m.full,
            '⚠️ Hình ảnh đã bị xóa do vi phạm chính sách nội dung.',
          );
          decision = 'rejected';
        } else if (modResult.decision === 'blur') {
          const blurred = this.insertCloudinaryBlur(m.url);
          if (blurred) {
            result = result.replace(m.full, `📷 [Image]: ${blurred}`);
          }
          if (decision !== 'rejected') decision = 'blurred';
        }
      } catch {
        // moderation error → keep original
      }
    }

    return { content: result, decision };
  }

  private async canAccessPrivateChannel(
    serverId: string,
    userId: string,
  ): Promise<boolean> {
    const allowedManageServer = await this.rolesService.hasPermission(
      serverId,
      userId,
      'manageServer',
    );
    if (allowedManageServer) return true;
    return this.rolesService.hasPermission(serverId, userId, 'manageChannels');
  }

  /**
   * Tuổi + mức xác minh máy chủ (thiết lập an toàn). Dùng cho xem/gửi tin và socket join.
   */
  private async resolveChannelChatGate(
    serverId: string,
    userId: string,
    serverLean?: Record<string, unknown> | null,
  ): Promise<{ allowed: boolean; reason?: ChatGateBlockReason }> {
    const server =
      serverLean ||
      ((await this.serverModel
        .findById(serverId)
        .select('ownerId members safetySettings isAgeRestricted')
        .lean()
        .exec()) as Record<string, unknown> | null);
    if (!server) return { allowed: false, reason: 'verification' };

    const isOwner =
      (server as any).ownerId?.toString?.() === userId ||
      String((server as any).ownerId) === String(userId);
    const canManageServer = await this.rolesService.hasPermission(
      serverId,
      userId,
      'manageServer',
    );
    const isBypass = isOwner || canManageServer;

    const usDoc = await this.userServerModel
      .findOne({
        userId: new Types.ObjectId(userId),
        serverId: new Types.ObjectId(serverId),
      })
      .lean()
      .exec();

    const ageRestrictedAcknowledged = Boolean(
      (usDoc as any)?.ageRestrictedAcknowledged,
    );

    const [userRow, profileRow] = await Promise.all([
      this.userModel
        .findById(userId)
        .select('createdAt isVerified')
        .lean()
        .exec(),
      this.profileModel
        .findOne({ userId: new Types.ObjectId(userId) })
        .select('birthdate')
        .lean()
        .exec(),
    ]);

    const memberRow = ((server as any).members || []).find(
      (m: any) => (m?.userId?._id ?? m?.userId)?.toString() === userId,
    );
    const memberJoinedAt = memberRow?.joinedAt
      ? new Date(memberRow.joinedAt)
      : null;

    const verificationLevel = normalizeServerVerificationLevel(
      (server as any).safetySettings?.spamProtection?.verificationLevel,
    );

    const isServerEmailVerified = Boolean((usDoc as any)?.serverEmailVerified);

    return evaluateChannelChatGate({
      isAgeRestricted: Boolean((server as any).isAgeRestricted),
      ageRestrictedAcknowledged,
      birthdate: (profileRow as any)?.birthdate ?? null,
      verificationLevel,
      isVerified: isServerEmailVerified,
      accountCreatedAt: new Date((userRow as any)?.createdAt || Date.now()),
      memberJoinedAt,
      isBypass,
    });
  }

  /** Cho WebSocket: chỉ join room khi được phép xem tin kênh. */
  async userCanJoinChannelRoom(
    channelId: string,
    userId: string,
  ): Promise<boolean> {
    const channel = await this.channelModel
      .findById(channelId)
      .select('serverId isPrivate')
      .lean()
      .exec();
    if (!channel) return false;
    const viewerOid = new Types.ObjectId(userId);
    const isMember = await this.serverModel.exists({
      _id: (channel as any).serverId,
      $or: [{ ownerId: viewerOid }, { 'members.userId': viewerOid }],
    });
    if (!isMember) return false;
    if ((channel as any).isPrivate) {
      const ok = await this.canAccessPrivateChannel(
        (channel as any).serverId.toString(),
        userId,
      );
      if (!ok) return false;
    }
    const gate = await this.resolveChannelChatGate(
      (channel as any).serverId.toString(),
      userId,
    );
    return gate.allowed;
  }

  private assertChatGateOrThrow(gate: {
    allowed: boolean;
    reason?: ChatGateBlockReason;
  }): void {
    if (gate.allowed) return;
    const msg =
      gate.reason === 'age_under_18'
        ? 'Tài khoản chưa đủ 18 tuổi để truy cập kênh máy chủ này'
        : gate.reason === 'age_ack'
          ? 'Bạn cần xác nhận cảnh báo giới hạn độ tuổi của máy chủ'
          : 'Bạn chưa đủ điều kiện xác minh để dùng kênh chat này';
    throw new ForbiddenException(msg);
  }

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
      .select('ownerId members safetySettings isAgeRestricted')
      .lean()
      .exec();
    if (!server) throw new NotFoundException('Server not found');

    const isOwner =
      (server as any).ownerId?.toString?.() === userId ||
      (server as any).ownerId?.toString?.() === userObjectId.toString();

    const isMember =
      isOwner ||
      (Array.isArray((server as any).members) &&
        (server as any).members.some(
          (m: any) => (m?.userId?._id ?? m?.userId)?.toString() === userId,
        ));

    if (!isMember) {
      throw new ForbiddenException('Bạn không thuộc server này');
    }

    if (channel.isPrivate) {
      const canAccessPrivate = await this.canAccessPrivateChannel(
        channel.serverId.toString(),
        userId,
      );
      if (!canAccessPrivate) {
        throw new ForbiddenException(
          'Vai trò của bạn không được phép vào kênh riêng tư này',
        );
      }
    }

    const gate = await this.resolveChannelChatGate(
      channel.serverId.toString(),
      userId,
      server as any,
    );
    this.assertChatGateOrThrow(gate);

    const safety = (server as any).safetySettings || {};
    const spamProtection = safety.spamProtection || {};
    const automod = safety.automod || {};
    const isBypass =
      isOwner ||
      (await this.rolesService.hasPermission(
        channel.serverId.toString(),
        userId,
        'manageServer',
      ));
    if (!isBypass) {
      const bannedWords: string[] = Array.isArray(automod.bannedWords)
        ? automod.bannedWords
        : [];
      const lowered = (createMessageDto.content || '').toLowerCase();
      const matchedBanned = bannedWords.some(
        (w) => w && lowered.includes(String(w).toLowerCase()),
      );
      if (matchedBanned && automod.bannedWordResponse === 'delete') {
        throw new ForbiddenException('Tin nhắn chứa từ bị cấm và đã bị chặn');
      }

      const member = (server as any).members?.find(
        (m: any) => (m?.userId?._id ?? m?.userId)?.toString() === userId,
      );
      if (member?.mentionRestricted) {
        throw new ForbiddenException(
          'Bạn đã bị hạn chế gửi tin nhắn do spam đề cập.',
        );
      }

      const msf = automod.mentionSpamFilter || {};
      if (msf.enabled) {
        const channelExempt = (msf.exemptChannelIds || []).includes(channelId);
        let roleExempt = false;
        if ((msf.exemptRoleIds || []).length > 0) {
          const userRoles = await this.rolesService.getMemberRoles(
            channel.serverId.toString(),
            userId,
          );
          const userRoleIds = (userRoles || []).map((r: any) =>
            (r._id ?? r).toString(),
          );
          roleExempt = (msf.exemptRoleIds as string[]).some((rid: string) =>
            userRoleIds.includes(rid),
          );
        }

        if (!channelExempt && !roleExempt) {
          if (
            member?.mentionBlockedUntil &&
            new Date(member.mentionBlockedUntil) > new Date()
          ) {
            const mentionMatches =
              (createMessageDto.content || '').match(
                /@(?:everyone|here|[^\s@]+)/gi,
              ) || [];
            if (mentionMatches.length > 0) {
              throw new ForbiddenException(
                'Bạn đang bị chặn đề cập. Vui lòng thử lại sau.',
              );
            }
          }

          const mentionLimit = Number(msf.mentionLimit || 20);
          const currentMentions =
            (createMessageDto.content || '').match(
              /@(?:everyone|here|[^\s@]+)/gi,
            ) || [];

          if (currentMentions.length > 0) {
            const windowMs = 10 * 60 * 1000;
            const since = new Date(Date.now() - windowMs);
            const recentMsgs = await this.messageModel
              .find({
                channelId: new Types.ObjectId(channelId),
                senderId: userObjectId,
                createdAt: { $gte: since },
              })
              .select('content')
              .lean()
              .exec();

            let totalMentions = currentMentions.length;
            for (const msg of recentMsgs) {
              const m =
                ((msg as any).content || '').match(
                  /@(?:everyone|here|[^\s@]+)/gi,
                ) || [];
              totalMentions += m.length;
            }

            if (totalMentions > mentionLimit) {
              await this.handleMentionSpamViolation(
                server as any,
                userId,
                channelId,
                msf,
              );
              if (msf.responses?.blockMessage) {
                throw new ForbiddenException(
                  'Phát hiện spam đề cập. Tin nhắn đã bị chặn.',
                );
              }
            }
          }
        }
      }
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

    const contentWithWarning =
      spamProtection.warnExternalLinks &&
      this.containsExternalLink(createMessageDto.content || '')
        ? `⚠️ Cảnh báo: liên kết ngoài danh sách tin cậy.\n\n${createMessageDto.content}`
        : createMessageDto.content;

    let finalAttachments = createMessageDto.attachments || [];
    let contentModerationResult = 'none';
    let moderatedContent = contentWithWarning;
    const contentFilterLevel: ContentFilterLevel =
      (safety.contentFilter?.level as ContentFilterLevel) || 'none';

    if (contentFilterLevel !== 'none' && !isBypass) {
      let shouldFilter = contentFilterLevel === 'all_members';
      if (!shouldFilter && contentFilterLevel === 'no_role_members') {
        const hasRole = await this.rolesService.hasAnyRole(
          channel.serverId.toString(),
          userId,
        );
        shouldFilter = !hasRole;
      }

      if (shouldFilter) {
        if (finalAttachments.length > 0) {
          const origLen = finalAttachments.length;
          finalAttachments = await this.moderateAttachments(finalAttachments);
          const imageRemoved = finalAttachments.length < origLen;
          const hasBlurred = finalAttachments.some((u) =>
            u.includes('e_blur:'),
          );
          if (imageRemoved) contentModerationResult = 'rejected';
          else if (hasBlurred) contentModerationResult = 'blurred';
        }

        const embeddedResult =
          await this.moderateEmbeddedImages(moderatedContent);
        moderatedContent = embeddedResult.content;
        if (embeddedResult.decision !== 'none') {
          contentModerationResult = embeddedResult.decision;
        }
      }
    }

    const messageTypeResolved = createMessageDto.messageType || 'text';
    let resolvedCustomStickerUrl: string | null = null;
    let resolvedServerStickerId: Types.ObjectId | null = null;

    const hasCustomStickerFields = !!(
      createMessageDto.customStickerUrl?.trim() ||
      createMessageDto.serverStickerId?.trim()
    );

    if (hasCustomStickerFields) {
      if (messageTypeResolved !== 'sticker') {
        throw new BadRequestException(
          'customStickerUrl/serverStickerId chỉ dùng với tin nhắn sticker',
        );
      }
      if (
        !createMessageDto.customStickerUrl?.trim() ||
        !createMessageDto.serverStickerId?.trim()
      ) {
        throw new BadRequestException(
          'Cần đủ customStickerUrl và serverStickerId cho sticker máy chủ',
        );
      }
      if (createMessageDto.giphyId?.trim()) {
        throw new BadRequestException(
          'Không gửi đồng thời sticker Giphy và sticker máy chủ',
        );
      }
      const sourceServerIdRaw =
        createMessageDto.serverStickerServerId?.trim() || '';
      const sourceServerId =
        sourceServerIdRaw && Types.ObjectId.isValid(sourceServerIdRaw)
          ? sourceServerIdRaw
          : channel.serverId?.toString?.() ?? String(channel.serverId);

      const isCrossServerSticker =
        String(sourceServerId) !==
        (channel.serverId?.toString?.() ?? String(channel.serverId));

      if (isCrossServerSticker) {
        const boost = await this.boostService.getBoostStatus(userId);
        if (!boost?.active) {
          throw new ForbiddenException(
            'Boost required to use server stickers across servers',
          );
        }
      }

      const srvStickers = await this.serverModel
        .findById(sourceServerId)
        .select('customStickers members ownerId')
        .lean()
        .exec();
      if (!srvStickers) {
        throw new BadRequestException('Server sticker source not found');
      }
      if (isCrossServerSticker) {
        const isOwner =
          String((srvStickers as any).ownerId) === String(userId) ||
          String((srvStickers as any).ownerId?._id ?? '') === String(userId);
        const isMember =
          isOwner ||
          (Array.isArray((srvStickers as any).members) &&
            (srvStickers as any).members.some(
              (m: any) =>
                (m?.userId?._id ?? m?.userId)?.toString?.() === String(userId),
            ));
        if (!isMember) {
          throw new ForbiddenException(
            'Bạn phải tham gia máy chủ chứa sticker để dùng ở máy chủ khác',
          );
        }
      }
      const sid = createMessageDto.serverStickerId.trim();
      const sticker = ((srvStickers as any)?.customStickers || []).find(
        (s: any) => s._id?.toString() === sid,
      );
      if (!sticker) {
        throw new BadRequestException('Sticker không thuộc máy chủ nguồn');
      }
      if (
        String(sticker.imageUrl).trim() !==
        createMessageDto.customStickerUrl.trim()
      ) {
        throw new BadRequestException(
          'URL sticker không khớp với dữ liệu máy chủ',
        );
      }
      resolvedCustomStickerUrl = sticker.imageUrl;
      resolvedServerStickerId = new Types.ObjectId(sid);
    }

    const message = new this.messageModel({
      channelId: new Types.ObjectId(channelId),
      senderId: userObjectId,
      content: moderatedContent,
      attachments: finalAttachments,
      contentModerationResult,
      replyTo: createMessageDto.replyTo
        ? new Types.ObjectId(createMessageDto.replyTo)
        : null,
      mentions: mentionIds.map((id) => new Types.ObjectId(id)),
      messageType: messageTypeResolved,
      giphyId: createMessageDto.giphyId || null,
      customStickerUrl: resolvedCustomStickerUrl,
      serverStickerId: resolvedServerStickerId,
      voiceUrl: createMessageDto.voiceUrl || null,
      voiceDuration: createMessageDto.voiceDuration ?? null,
    });

    const savedMessage = await message.save();

    channel.messageCount = (channel.messageCount || 0) + 1;
    await channel.save();

    const enriched = await this.getMessageByIdEnriched(
      savedMessage._id.toString(),
    );
    return enriched;
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

    const server = await this.serverModel
      .findById(channel.serverId)
      .select('ownerId members safetySettings isAgeRestricted')
      .lean()
      .exec();
    if (!server) throw new NotFoundException('Server not found');

    const isOwner =
      (server as any).ownerId?.toString?.() === userId ||
      String((server as any).ownerId) === String(userId);
    const isMember =
      isOwner ||
      (Array.isArray((server as any).members) &&
        (server as any).members.some(
          (m: any) => (m?.userId?._id ?? m?.userId)?.toString() === userId,
        ));
    if (!isMember) {
      throw new ForbiddenException('Bạn không thuộc server này');
    }

    if (channel.isPrivate) {
      const canAccessPrivate = await this.canAccessPrivateChannel(
        channel.serverId.toString(),
        userId,
      );
      if (!canAccessPrivate) {
        throw new ForbiddenException(
          'Vai trò của bạn không được phép vào kênh riêng tư này',
        );
      }
    }

    const gate = await this.resolveChannelChatGate(
      channel.serverId.toString(),
      userId,
      server as any,
    );
    this.assertChatGateOrThrow(gate);

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
    return enriched;
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
      (server as any).interactionSettings?.defaultNotificationLevel ===
      'mentions'
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

    const allSenderIds = [
      ...new Set(messages.map((m: any) => m.senderId.toString())),
    ];
    const mutedSenders = await this.mentionMuteService.listMutedSendersForOwner(
      userId,
      allSenderIds,
    );
    const visibleMessages = messages.filter(
      (m: any) => !mutedSenders.has(m.senderId.toString()),
    );
    if (visibleMessages.length === 0) return [];

    const visibleSenderIds = [
      ...new Set(visibleMessages.map((m: any) => m.senderId.toString())),
    ];
    const profiles = await this.profileModel
      .find({
        userId: { $in: visibleSenderIds.map((id) => new Types.ObjectId(id)) },
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

    return visibleMessages.map((msg: any) => {
      const ch = msg.channelId;
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
        createdAt: msg.createdAt?.toISOString?.() ?? new Date().toISOString(),
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
    const senderUserId =
      senderId != null ? new Types.ObjectId(senderId.toString()) : null;
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
        ...(typeof msg.senderId === 'object'
          ? msg.senderId
          : { _id: msg.senderId, email: '' }),
        displayName: senderProfile?.displayName ?? undefined,
        username: senderProfile?.username ?? undefined,
        avatarUrl: senderProfile?.avatarUrl ?? undefined,
      },
    };

    const replyToRaw = msg.replyTo as any;
    if (replyToRaw && typeof replyToRaw === 'object') {
      const rtSenderId = replyToRaw.senderId?._id ?? replyToRaw.senderId;
      const rtUserId =
        rtSenderId != null ? new Types.ObjectId(rtSenderId.toString()) : null;
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
  ): Promise<{
    messages: any[];
    chatViewBlocked: boolean;
    chatBlockReason: ChatGateBlockReason | null;
  }> {
    const match: any = {
      channelId: new Types.ObjectId(channelId),
      isDeleted: false,
    };

    // Access Control: nếu có viewerId thì chỉ cho xem khi viewer thuộc server.
    if (viewerId) {
      const channel = await this.channelModel
        .findById(channelId)
        .select('serverId isPrivate')
        .lean()
        .exec();
      if (!channel) throw new NotFoundException('Channel not found');

      const viewerOid = new Types.ObjectId(viewerId);
      const isMember = await this.serverModel.exists({
        _id: channel.serverId,
        $or: [{ ownerId: viewerOid }, { 'members.userId': viewerOid }],
      });

      if (!isMember) throw new ForbiddenException('Bạn không thuộc server này');

      if ((channel as any).isPrivate) {
        const canAccessPrivate = await this.canAccessPrivateChannel(
          channel.serverId.toString(),
          viewerId,
        );
        if (!canAccessPrivate) {
          throw new ForbiddenException(
            'Vai trò của bạn không được phép vào kênh riêng tư này',
          );
        }
      }

      const serverForGate = await this.serverModel
        .findById(channel.serverId)
        .select('ownerId members safetySettings isAgeRestricted')
        .lean()
        .exec();
      const gate = await this.resolveChannelChatGate(
        channel.serverId.toString(),
        viewerId,
        serverForGate as any,
      );
      if (!gate.allowed) {
        return {
          messages: [],
          chatViewBlocked: true,
          chatBlockReason: gate.reason ?? null,
        };
      }
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
        const senderUserId =
          senderId != null ? new Types.ObjectId(senderId.toString()) : null;
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
            ...(typeof msg.senderId === 'object'
              ? msg.senderId
              : { _id: msg.senderId, email: '' }),
            displayName: senderProfile?.displayName ?? undefined,
            username: senderProfile?.username ?? undefined,
            avatarUrl: senderProfile?.avatarUrl ?? undefined,
          },
        };

        const replyToRaw = msg.replyTo;
        if (replyToRaw && typeof replyToRaw === 'object') {
          const rtSenderId = replyToRaw.senderId?._id ?? replyToRaw.senderId;
          const rtUserId =
            rtSenderId != null
              ? new Types.ObjectId(rtSenderId.toString())
              : null;
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
          (server as any)?.interactionSettings?.stickerReplyWelcomeEnabled ??
          true;
        for (const m of enriched) {
          if (m.messageType === 'welcome') {
            m.stickerReplyWelcomeEnabled = stickerReply;
          }
        }
      }
    }

    return {
      messages: enriched,
      chatViewBlocked: false,
      chatBlockReason: null,
    };
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
