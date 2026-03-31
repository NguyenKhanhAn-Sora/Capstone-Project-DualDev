import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ServersService } from '../servers/servers.service';
import { EventsService } from '../events/events.service';
import { ServerInvitesService } from '../server-invites/server-invites.service';
import { ServerEvent } from '../events/event.schema';
import { InboxSeen } from './inbox-seen.schema';
import { DirectMessagesService } from '../direct-messages/direct-messages.service';
import { MessagesService } from '../messages/messages.service';
import { IgnoredService } from '../users/ignored.service';

export interface InboxEventItem {
  type: 'event';
  _id: string;
  serverId: string;
  serverName: string;
  serverAvatarUrl?: string | null;
  channelId?: { _id: string; name: string; type: string } | null;
  topic: string;
  startAt: string;
  endAt: string;
  status?: string;
  description?: string | null;
  coverImageUrl?: string | null;
  createdAt: string;
  seen?: boolean;
}

export interface InboxServerInviteItem {
  type: 'server_invite';
  _id: string;
  serverId: string;
  serverName: string;
  serverAvatarUrl?: string | null;
  inviterId: string;
  inviterDisplay: string;
  createdAt: string;
  seen?: boolean;
}

export interface InboxServerNotificationItem {
  type: 'server_notification';
  _id: string;
  serverId: string;
  serverName: string;
  serverAvatarUrl?: string | null;
  title: string;
  content: string;
  targetRoleName?: string | null;
  createdAt: string;
  seen?: boolean;
}

export type InboxForYouItem =
  | InboxEventItem
  | InboxServerInviteItem
  | InboxServerNotificationItem;

export interface InboxUnreadDmItem {
  type: 'dm';
  userId: string;
  displayName: string;
  username: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface InboxUnreadChannelItem {
  type: 'channel';
  channelId: string;
  channelName: string;
  serverId: string;
  serverName: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount?: number;
}

export type InboxUnreadItem = InboxUnreadDmItem | InboxUnreadChannelItem;

@Injectable()
export class InboxService {
  constructor(
    @InjectModel(InboxSeen.name) private inboxSeenModel: Model<InboxSeen>,
    private readonly serversService: ServersService,
    private readonly eventsService: EventsService,
    private readonly serverInvitesService: ServerInvitesService,
    private readonly directMessagesService: DirectMessagesService,
    private readonly messagesService: MessagesService,
    private readonly ignoredService: IgnoredService,
  ) {}

  /** Dành cho bạn: sự kiện từ server + lời mời vào máy chủ (gộp, sắp xếp, đánh dấu đã xem). */
  async getForYou(userId: string): Promise<InboxForYouItem[]> {
    const userObjectId = new Types.ObjectId(userId);
    const [eventItems, pendingInvites, serverNotifications, seenDocs] =
      await Promise.all([
        this.getForYouEvents(userId),
        this.serverInvitesService.getPendingForUser(userId),
        this.serversService.getForYouRoleNotifications(userId),
        this.inboxSeenModel
          .find({ userId: userObjectId })
          .select('sourceType sourceId')
          .lean()
          .exec(),
      ]);
    const seenSet = new Set(
      (seenDocs as { sourceType: string; sourceId: string }[]).map(
        (s) => `${s.sourceType}:${s.sourceId}`,
      ),
    );
    const inviteItems: InboxServerInviteItem[] = (pendingInvites as any[]).map(
      (inv) => {
        const server = inv.serverId as {
          _id: string;
          name: string;
          avatarUrl?: string;
        };
        const from = inv.fromUserId as { _id: string; email?: string };
        const id = inv._id.toString();
        return {
          type: 'server_invite' as const,
          _id: id,
          serverId:
            (server?._id ?? inv.serverId)?.toString?.() ??
            inv.serverId?.toString?.() ??
            '',
          serverName: server?.name ?? 'Máy chủ',
          serverAvatarUrl: server?.avatarUrl ?? null,
          inviterId:
            (from?._id ?? inv.fromUserId)?.toString?.() ??
            inv.fromUserId?.toString?.() ??
            '',
          inviterDisplay: from?.email ?? 'Ai đó',
          createdAt: inv.createdAt?.toISOString?.() ?? new Date().toISOString(),
          seen: seenSet.has(`server_invite:${id}`),
        };
      },
    );
    const combined: InboxForYouItem[] = [
      ...eventItems.map((e) => ({ ...e, seen: seenSet.has(`event:${e._id}`) })),
      ...serverNotifications.map((n) => ({
        ...n,
        seen: seenSet.has(`server_notification:${n._id}`),
      })),
      ...inviteItems,
    ];
    combined.sort((a, b) => {
      const dateA = a.type === 'event' ? a.startAt : a.createdAt;
      const dateB = b.type === 'event' ? b.startAt : b.createdAt;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
    return combined.slice(0, 50);
  }

  /** Đánh dấu một mục (event hoặc server_invite) là đã xem. */
  async markSeen(
    userId: string,
    sourceType: string,
    sourceId: string,
  ): Promise<void> {
    const userObjectId = new Types.ObjectId(userId);
    await this.inboxSeenModel.findOneAndUpdate(
      { userId: userObjectId, sourceType, sourceId },
      { $set: { seenAt: new Date() } },
      { upsert: true },
    );
  }

  /** Sự kiện từ các server user tham gia (đang diễn ra + sắp diễn ra). */
  async getForYouEvents(userId: string): Promise<InboxEventItem[]> {
    const servers = await this.serversService.getServersByUserId(userId);
    const results: InboxEventItem[] = [];

    for (const server of servers) {
      const serverId = server._id.toString();
      const [active, upcoming] = await Promise.all([
        this.eventsService.getActiveByServer(serverId),
        this.eventsService.getUpcomingByServer(serverId),
      ]);
      const events: ServerEvent[] = [...active, ...upcoming];
      for (const ev of events) {
        results.push(this.toInboxEventItem(ev, server));
      }
    }

    results.sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );
    return results.slice(0, 50);
  }

  private toInboxEventItem(
    ev: ServerEvent,
    server: { name: string; avatarUrl?: string | null },
  ): InboxEventItem {
    const channelId = ev.channelId
      ? {
          _id: (ev.channelId as any)._id?.toString?.() ?? '',
          name: (ev.channelId as any).name ?? '',
          type: (ev.channelId as any).type ?? 'text',
        }
      : null;
    return {
      type: 'event',
      _id: ev._id.toString(),
      serverId: ev.serverId.toString(),
      serverName: server.name,
      serverAvatarUrl: server.avatarUrl ?? null,
      channelId,
      topic: ev.topic,
      startAt: ev.startAt.toISOString(),
      endAt: ev.endAt.toISOString(),
      status: (ev as any).status,
      description: (ev as any).description ?? null,
      coverImageUrl: (ev as any).coverImageUrl ?? null,
      createdAt:
        (ev as any).createdAt?.toISOString?.() ?? new Date().toISOString(),
    };
  }

  /** Tin nhắn chưa đọc: DM (displayName + nội dung tin) và kênh server (tên server, tên kênh + nội dung). Loại trừ người bị bỏ qua. */
  async getUnread(userId: string): Promise<InboxUnreadItem[]> {
    const ignoredSet = await this.ignoredService.getIgnoredUserIds(userId);
    const [dmItems, servers] = await Promise.all([
      this.directMessagesService.getUnreadConversations(userId),
      this.serversService.getServersByUserId(userId),
    ]);
    const result: InboxUnreadItem[] = dmItems.map((c) => ({
      type: 'dm',
      userId: c.userId,
      displayName: c.displayName,
      username: c.username,
      lastMessage: c.lastMessage,
      lastMessageAt: c.lastMessageAt,
      unreadCount: c.unreadCount,
    }));

    for (const server of servers) {
      const serverId = server._id.toString();
      const channels = (server as any).channels ?? [];
      for (const ch of channels) {
        const channelId = ch._id?.toString?.() ?? ch.toString?.() ?? '';
        const channelName = ch.name ?? 'general';
        const channelType = ch.type;
        if (channelType !== 'text') continue;
        const unreadCount =
          await this.messagesService.getUnreadCountByChannelId(
            userId,
            channelId,
          );
        if (unreadCount <= 0) continue;
        const messages = await this.messagesService.getMessagesByChannelId(
          channelId,
          1,
          0,
          userId,
        );
        const lastMsg = messages[0];
        if (!lastMsg) continue;
        const senderId = lastMsg.senderId?._id ?? lastMsg.senderId;
        const senderStr = senderId?.toString?.();
        if (senderStr && ignoredSet.has(senderStr)) continue;
        result.push({
          type: 'channel',
          channelId,
          channelName,
          serverId,
          serverName: (server as any).name ?? 'Máy chủ',
          lastMessage: lastMsg.content ?? '',
          lastMessageAt:
            lastMsg.createdAt?.toISOString?.() ?? new Date().toISOString(),
          unreadCount,
        });
      }
    }

    result.sort((a, b) => {
      const timeA = a.type === 'dm' ? a.lastMessageAt : a.lastMessageAt;
      const timeB = b.type === 'dm' ? b.lastMessageAt : b.lastMessageAt;
      return new Date(timeB).getTime() - new Date(timeA).getTime();
    });
    return result.slice(0, 50);
  }

  /** Đề cập trong kênh — trả về các tin nhắn mà user bị @mention. */
  async getMentions(userId: string): Promise<unknown[]> {
    return this.messagesService.getChannelMentionsForUser(userId);
  }
}
