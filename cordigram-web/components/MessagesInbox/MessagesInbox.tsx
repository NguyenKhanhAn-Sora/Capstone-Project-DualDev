"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import styles from "./MessagesInbox.module.css";
import {
  fetchInboxForYou,
  fetchInboxUnread,
  fetchInboxMentions,
  markInboxSeen,
  type InboxForYouItem,
  type InboxServerInviteItem,
  type InboxUnreadItem,
  type InboxMentionItem,
} from "@/lib/inbox-api";
import { getApiBaseUrl } from "@/lib/api";
import { acceptServerInvite, declineServerInvite, getServerAccessSettings } from "@/lib/servers-api";
type TabKey = "for-you" | "unread" | "mentions";

interface MessagesInboxProps {
  onClose: () => void;
  onNavigateToChannel?: (serverId: string, channelId: string) => void;
  /** Nhảy sang DM với user (userId, displayName, username, avatarUrl?). */
  onNavigateToDM?: (userId: string, displayName: string, username: string, avatarUrl?: string) => void;
  /** Gọi sau khi đánh dấu một mục đã xem (để parent cập nhật chấm đỏ trên icon hộp thư). */
  onMarkSeen?: () => void;
  /** Sau khi chấp nhận lời mời: parent load lại danh sách server và chọn server vừa tham gia. */
  onAcceptInvite?: (serverId: string) => Promise<void>;
  /**
   * Nếu server bật apply-to-join, gọi callback để parent mở modal câu hỏi thay vì accept invite ngay.
   * Trả true nếu đã mở popup apply (inbox sẽ dừng luồng accept).
   */
  onApplyToJoinBeforeAccept?: (serverId: string, inviteId: string) => Promise<boolean>;
}

function formatTimeAgo(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffM = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  if (diffM < 60) return `${diffM} phút`;
  if (diffH < 24) return `${diffH} giờ`;
  if (diffD < 28) return `${diffD} ngày`;
  return d.toLocaleDateString("vi-VN");
}

export default function MessagesInbox({
  onClose,
  onNavigateToChannel,
  onNavigateToDM,
  onMarkSeen,
  onAcceptInvite,
  onApplyToJoinBeforeAccept,
}: MessagesInboxProps) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("for-you");
  const [forYouItems, setForYouItems] = useState<InboxForYouItem[]>([]);
  const [unreadItems, setUnreadItems] = useState<InboxUnreadItem[]>([]);
  const [mentionItems, setMentionItems] = useState<InboxMentionItem[]>([]);
  const [loading, setLoading] = useState({ "for-you": true, unread: true, mentions: true });
  const dmSocketRef = useRef<Socket | null>(null);
  const unreadRefreshTimerRef = useRef<number | null>(null);

  const authToken = useMemo(() => {
    if (typeof window === "undefined") return "";
    return (
      window.localStorage.getItem("accessToken") ||
      window.localStorage.getItem("token") ||
      ""
    );
  }, []);

  const scheduleRefreshUnread = () => {
    if (unreadRefreshTimerRef.current != null) {
      window.clearTimeout(unreadRefreshTimerRef.current);
    }
    unreadRefreshTimerRef.current = window.setTimeout(() => {
      fetchInboxUnread()
        .then((res) => setUnreadItems(res.items ?? []))
        .catch(() => undefined);
    }, 250);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading({ "for-you": true, unread: true, mentions: true });
      const results = await Promise.allSettled([
        fetchInboxForYou(),
        fetchInboxUnread(),
        fetchInboxMentions(),
      ]);
      if (cancelled) return;
      const forYouRes = results[0].status === "fulfilled" ? results[0].value : null;
      const unreadRes = results[1].status === "fulfilled" ? results[1].value : null;
      const mentionsRes = results[2].status === "fulfilled" ? results[2].value : null;
      setForYouItems(forYouRes?.items ?? []);
      setUnreadItems(unreadRes?.items ?? []);
      setMentionItems(mentionsRes?.items ?? []);
      setLoading({ "for-you": false, unread: false, mentions: false });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Realtime refresh for "Chưa đọc" tab (DM) + "Đề cập" tab (channel mentions).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!authToken) return;

    dmSocketRef.current?.disconnect();
    const dmSocket = io(`${getApiBaseUrl()}/direct-messages`, {
      auth: { token: authToken },
      transports: ["websocket"],
    });

    dmSocket.on("new-message", () => {
      scheduleRefreshUnread();
    });
    dmSocket.on("dm-unread-count", () => {
      scheduleRefreshUnread();
    });
    dmSocket.on("messages-read", () => {
      scheduleRefreshUnread();
    });

    dmSocketRef.current = dmSocket;

    const chSocket = io(`${getApiBaseUrl()}/channel-messages`, {
      auth: { token: authToken },
      transports: ["websocket"],
    });

    chSocket.on("channel-notification", (data: any) => {
      if (data?.isMention) {
        fetchInboxMentions()
          .then((res) => setMentionItems(res.items ?? []))
          .catch(() => undefined);
      }
      scheduleRefreshUnread();
    });

    return () => {
      if (unreadRefreshTimerRef.current != null) {
        window.clearTimeout(unreadRefreshTimerRef.current);
        unreadRefreshTimerRef.current = null;
      }
      dmSocketRef.current?.disconnect();
      dmSocketRef.current = null;
      chSocket.disconnect();
    };
  }, [authToken]);

  useEffect(() => {
    if (tab !== "mentions") return;
    let cancelled = false;
    fetchInboxMentions()
      .then((res) => {
        if (!cancelled) setMentionItems(res.items ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [tab]);

  /** Mở item trong tab Dành cho bạn và đánh dấu đã xem. */
  const handleForYouClick = async (item: InboxForYouItem) => {
    if (item.type === "server_invite") return;
    const sourceType =
      item.type === "event" ? "event" : "server_notification";
    try {
      await markInboxSeen(sourceType, item._id);
      setForYouItems((prev) =>
        prev.map((i) =>
          i._id === item._id && i.type === item.type ? { ...i, seen: true } : i,
        ),
      );
      onMarkSeen?.();
    } catch (_) {}
    if (item.type === "event") {
      router.push(`/messages?server=${item.serverId}&event=${item._id}`);
    } else {
      router.push(`/messages?server=${item.serverId}`);
    }
    onClose();
  };

  const removeInviteFromList = (inviteId: string) => {
    setForYouItems((prev) => prev.filter((i) => !(i.type === "server_invite" && i._id === inviteId)));
    onMarkSeen?.();
  };

  /** Chấp nhận lời mời vào máy chủ (nút ✓). */
  const handleAcceptInvite = async (item: InboxServerInviteItem) => {
    try {
      // Nếu server bật apply-to-join, để parent mở modal câu hỏi trước.
      if (onApplyToJoinBeforeAccept) {
        try {
          const settings = await getServerAccessSettings(item.serverId);
          if (settings.accessMode === "apply") {
            const opened = await onApplyToJoinBeforeAccept(item.serverId, item._id);
            if (opened) {
              await markInboxSeen("server_invite", item._id);
              removeInviteFromList(item._id);
              onClose();
              return;
            }
          }
        } catch {
          // Nếu không lấy được settings, tiếp tục luồng accept bình thường.
        }
      }

      await acceptServerInvite(item._id);
      await markInboxSeen("server_invite", item._id);
      removeInviteFromList(item._id);
      if (onAcceptInvite) {
        await onAcceptInvite(item.serverId);
      } else {
        router.push(`/messages?server=${item.serverId}`);
      }
      onClose();
    } catch (e) {
      console.error("Accept invite failed", e);
    }
  };

  /** Từ chối lời mời vào máy chủ (nút ✗). */
  const handleDeclineInvite = async (item: InboxServerInviteItem) => {
    try {
      await declineServerInvite(item._id);
      await markInboxSeen("server_invite", item._id);
      removeInviteFromList(item._id);
    } catch (e) {
      console.error("Decline invite failed", e);
    }
  };

  const handleUnreadClick = (item: InboxUnreadItem) => {
    if (item.type === "dm") {
      if (onNavigateToDM) onNavigateToDM(item.userId, item.displayName, item.username, "");
      else router.push(`/messages?dm=${item.userId}`);
    } else {
      if (onNavigateToChannel) onNavigateToChannel(item.serverId, item.channelId);
      else router.push(`/messages?server=${item.serverId}&channel=${item.channelId}`);
    }
    onClose();
  };

  const handleMentionClick = async (item: InboxMentionItem) => {
    try {
      await markInboxSeen("channel_mention", item.messageId || item.id);
      setMentionItems((prev) => prev.filter((m) => m.id !== item.id));
    } catch (_) {}
    if (onNavigateToChannel) onNavigateToChannel(item.serverId, item.channelId);
    else router.push(`/messages?server=${item.serverId}&channel=${item.channelId}`);
    onClose();
  };

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden />
      <div className={styles.panel} role="dialog" aria-labelledby="inbox-title">
        <div className={styles.header}>
          <h2 id="inbox-title" className={styles.title}>
            <span className={styles.titleIcon} aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </span>
            Hộp thư đến
          </h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Đóng">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${tab === "for-you" ? styles.tabActive : ""}`}
            onClick={() => setTab("for-you")}
          >
            Dành cho Bạn
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab === "unread" ? styles.tabActive : ""}`}
            onClick={() => setTab("unread")}
          >
            Chưa đọc
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab === "mentions" ? styles.tabActive : ""}`}
            onClick={() => setTab("mentions")}
          >
            Đề cập
          </button>
        </div>

        <div className={styles.list}>
          {tab === "for-you" && (
            <>
              {loading["for-you"] ? (
                <div className={styles.loading}>Đang tải...</div>
              ) : forYouItems.length === 0 ? (
                <div className={styles.empty}>
                  Không có sự kiện, lời mời hoặc thông báo vai trò nào từ các máy chủ của bạn.
                </div>
              ) : (
                forYouItems.map((item) =>
                  item.type === "event" ? (
                    <button
                      key={`event-${item._id}`}
                      type="button"
                      className={styles.eventItem}
                      onClick={() => handleForYouClick(item)}
                    >
                      <div className={styles.eventItemAvatarWrap}>
                        <div
                          className={styles.eventAvatar}
                          style={
                            item.serverAvatarUrl
                              ? { backgroundImage: `url(${item.serverAvatarUrl})` }
                              : undefined
                          }
                        >
                          {!item.serverAvatarUrl && item.serverName.charAt(0).toUpperCase()}
                        </div>
                        {item.seen !== true && <span className={styles.eventItemUnreadDot} aria-hidden />}
                      </div>
                      <div className={styles.eventBody}>
                        <p className={styles.eventTitle}>
                          {item.topic}
                          {item.status === "live" && (
                            <span style={{ color: "var(--color-primary)", marginLeft: 6 }}>• Đang diễn ra</span>
                          )}
                        </p>
                        <p className={styles.eventMeta}>
                          đã bắt đầu trong Máy chủ của {item.serverName}.
                        </p>
                        <p className={styles.eventTime}>{formatTimeAgo(item.startAt)}</p>
                      </div>
                    </button>
                  ) : item.type === "server_notification" ? (
                    <button
                      key={`server-notification-${item._id}`}
                      type="button"
                      className={styles.eventItem}
                      onClick={() => handleForYouClick(item)}
                    >
                      <div className={styles.eventItemAvatarWrap}>
                        <div
                          className={styles.eventAvatar}
                          style={
                            item.serverAvatarUrl
                              ? { backgroundImage: `url(${item.serverAvatarUrl})` }
                              : undefined
                          }
                        >
                          {!item.serverAvatarUrl && item.serverName.charAt(0).toUpperCase()}
                        </div>
                        {item.seen !== true && <span className={styles.eventItemUnreadDot} aria-hidden />}
                      </div>
                      <div className={styles.eventBody}>
                        <p className={styles.eventTitle}>{item.title}</p>
                        <p className={styles.eventMeta}>
                          {item.serverName}
                          {item.targetRoleName ? ` • ${item.targetRoleName}` : ""}
                        </p>
                        <p className={styles.unreadPreview}>
                          {item.content}
                        </p>
                        <p className={styles.eventTime}>{formatTimeAgo(item.createdAt)}</p>
                      </div>
                    </button>
                  ) : (
                    <div
                      key={`invite-${item._id}`}
                      className={styles.inviteItem}
                    >
                      <div className={styles.eventItemAvatarWrap}>
                        <div
                          className={styles.eventAvatar}
                          style={
                            item.serverAvatarUrl
                              ? { backgroundImage: `url(${item.serverAvatarUrl})` }
                              : undefined
                          }
                        >
                          {!item.serverAvatarUrl && item.serverName.charAt(0).toUpperCase()}
                        </div>
                        {item.seen !== true && <span className={styles.eventItemUnreadDot} aria-hidden />}
                      </div>
                      <div className={styles.eventBody}>
                        <p className={styles.eventTitle}>
                          Lời mời vào máy chủ
                        </p>
                        <p className={styles.eventMeta}>
                          {item.inviterDisplay} mời bạn tham gia {item.serverName}.
                        </p>
                        <p className={styles.eventTime}>{formatTimeAgo(item.createdAt)}</p>
                      </div>
                      <div className={styles.inviteItemActions}>
                        <button
                          type="button"
                          className={styles.inviteActionBtn}
                          title="Chấp nhận"
                          onClick={() => handleAcceptInvite(item)}
                          aria-label="Chấp nhận lời mời"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className={`${styles.inviteActionBtn} ${styles.inviteActionBtnDecline}`}
                          title="Từ chối"
                          onClick={() => handleDeclineInvite(item)}
                          aria-label="Từ chối lời mời"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ),
                )
              )}
            </>
          )}

          {tab === "unread" && (
            <>
              {loading.unread ? (
                <div className={styles.loading}>Đang tải...</div>
              ) : unreadItems.length === 0 ? (
                <div className={styles.empty}>
                  Không có tin nhắn hoặc thông báo chưa đọc từ các kênh.
                </div>
              ) : (
                unreadItems.map((item) =>
                  item.type === "dm" ? (
                    <button
                      key={`dm-${item.userId}`}
                      type="button"
                      className={styles.unreadItem}
                      onClick={() => handleUnreadClick(item)}
                    >
                      <div className={styles.eventItemAvatarWrap}>
                        <div className={styles.eventAvatar}>
                          {item.displayName?.charAt(0)?.toUpperCase() ??
                            item.username?.charAt(0)?.toUpperCase() ??
                            "?"}
                        </div>
                        <span className={styles.eventItemUnreadDot} aria-hidden />
                      </div>
                      <div className={styles.eventBody}>
                        <div className={styles.unreadTopRow}>
                          <p className={styles.unreadTitle}>
                            {item.displayName || item.username || "Tin nhắn"}
                          </p>
                          <div className={styles.unreadRight}>
                            <span className={styles.unreadTime}>
                              {formatTimeAgo(item.lastMessageAt)}
                            </span>
                            {(item.unreadCount ?? 0) > 0 ? (
                              <span className={styles.badge}>
                                {item.unreadCount > 99 ? "99+" : item.unreadCount}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <p className={styles.unreadPreview}>
                          {item.lastMessage?.trim()
                            ? item.lastMessage
                            : "Bạn có tin nhắn mới"}
                        </p>
                      </div>
                    </button>
                  ) : (
                    <button
                      key={`${item.serverId}-${item.channelId}`}
                      type="button"
                      className={styles.unreadItem}
                      onClick={() => handleUnreadClick(item)}
                    >
                      <div className={styles.eventItemAvatarWrap}>
                        <div className={styles.eventAvatar}>
                          {item.serverName?.charAt(0)?.toUpperCase() ?? "#"}
                        </div>
                        <span className={styles.eventItemUnreadDot} aria-hidden />
                      </div>
                      <div className={styles.eventBody}>
                        <div className={styles.unreadTopRow}>
                          <p className={styles.unreadTitle}>
                            {item.serverName}, #{item.channelName}
                          </p>
                          <div className={styles.unreadRight}>
                            <span className={styles.unreadTime}>
                              {formatTimeAgo(item.lastMessageAt)}
                            </span>
                            {(item.unreadCount ?? 0) > 0 ? (
                              <span className={styles.badge}>
                                {(item.unreadCount ?? 0) > 99
                                  ? "99+"
                                  : item.unreadCount}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <p className={styles.unreadPreview}>
                          {item.lastMessage?.trim()
                            ? item.lastMessage
                            : "Bạn có tin nhắn mới"}
                        </p>
                      </div>
                    </button>
                  )
                )
              )}
            </>
          )}

          {tab === "mentions" && (
            <>
              {loading.mentions ? (
                <div className={styles.loading}>Đang tải...</div>
              ) : mentionItems.length === 0 ? (
                <div className={styles.empty}>
                  Chưa có ai đề cập bạn trong kênh.
                </div>
              ) : (
                mentionItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={styles.unreadItem}
                    onClick={() => handleMentionClick(item)}
                  >
                    <div className={styles.eventItemAvatarWrap}>
                      <div className={styles.eventAvatar}>
                        {(item.serverName?.trim() || "#").charAt(0).toUpperCase()}
                      </div>
                    </div>
                    <div className={styles.eventBody}>
                      <div className={styles.unreadTopRow}>
                        <p className={styles.unreadTitle}>
                          {item.serverName?.trim() || "Máy chủ"}, #{item.channelName}
                        </p>
                        <span className={styles.unreadTime}>
                          {formatTimeAgo(item.createdAt)}
                        </span>
                      </div>
                      <p className={styles.unreadPreview}>
                        <strong>{item.actorName}</strong> đã đề cập bạn
                        {item.excerpt?.trim()
                          ? ` — ${item.excerpt.trim().slice(0, 140)}`
                          : ""}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
