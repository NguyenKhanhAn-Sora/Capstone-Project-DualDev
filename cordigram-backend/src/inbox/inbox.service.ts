import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ServersService } from '../servers/servers.service';
import { EventsService } from '../events/events.service';
import { ServerInvitesService } from '../server-invites/server-invites.service';
import { ServerEvent } from '../events/event.schema';
import { InboxSeen } from './inbox-seen.schema';

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

export type InboxForYouItem = InboxEventItem | InboxServerInviteItem;

@Injectable()
export class InboxService {
  constructor(
    @InjectModel(InboxSeen.name) private inboxSeenModel: Model<InboxSeen>,
    private readonly serversService: ServersService,
    private readonly eventsService: EventsService,
    private readonly serverInvitesService: ServerInvitesService,
  ) {}

  /** Dành cho bạn: sự kiện từ server + lời mời vào máy chủ (gộp, sắp xếp, đánh dấu đã xem). */
  async getForYou(userId: string): Promise<InboxForYouItem[]> {
    const userObjectId = new Types.ObjectId(userId);
    const [eventItems, pendingInvites, seenDocs] = await Promise.all([
      this.getForYouEvents(userId),
      this.serverInvitesService.getPendingForUser(userId),
      this.inboxSeenModel.find({ userId: userObjectId }).select('sourceType sourceId').lean().exec(),
    ]);
    const seenSet = new Set(
      (seenDocs as { sourceType: string; sourceId: string }[]).map(
        (s) => `${s.sourceType}:${s.sourceId}`,
      ),
    );
    const inviteItems: InboxServerInviteItem[] = (pendingInvites as any[]).map(
      (inv) => {
        const server = inv.serverId as { _id: string; name: string; avatarUrl?: string };
        const from = inv.fromUserId as { _id: string; email?: string };
        const id = inv._id.toString();
        return {
          type: 'server_invite' as const,
          _id: id,
          serverId: (server?._id ?? inv.serverId)?.toString?.() ?? inv.serverId?.toString?.() ?? '',
          serverName: server?.name ?? 'Máy chủ',
          serverAvatarUrl: server?.avatarUrl ?? null,
          inviterId: (from?._id ?? inv.fromUserId)?.toString?.() ?? inv.fromUserId?.toString?.() ?? '',
          inviterDisplay: from?.email ?? 'Ai đó',
          createdAt: inv.createdAt?.toISOString?.() ?? new Date().toISOString(),
          seen: seenSet.has(`server_invite:${id}`),
        };
      },
    );
    const combined: InboxForYouItem[] = [
      ...eventItems.map((e) => ({ ...e, seen: seenSet.has(`event:${e._id}`) })),
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
  async markSeen(userId: string, sourceType: string, sourceId: string): Promise<void> {
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

    results.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    return results.slice(0, 50);
  }

  private toInboxEventItem(ev: ServerEvent, server: { name: string; avatarUrl?: string | null }): InboxEventItem {
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
      createdAt: (ev as any).createdAt?.toISOString?.() ?? new Date().toISOString(),
    };
  }

  /** Tin nhắn/kênh chưa đọc - placeholder, sẽ triển khai khi có channel read state */
  async getUnread(_userId: string): Promise<unknown[]> {
    return [];
  }

  /** Đề cập trong kênh - placeholder, sẽ triển khai khi có mention trong message */
  async getMentions(_userId: string): Promise<unknown[]> {
    return [];
  }
}
