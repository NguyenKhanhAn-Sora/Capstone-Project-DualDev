"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DiscordCard } from "discord-card-react";
import "discord-card-react/styles";
import { useTheme } from "@/component/theme-provider";
import styles from "./ChannelUserProfileRoot.module.css";
import type { Friend } from "@/lib/servers-api";
import {
  createServerInvite,
  followUser,
  unfollowUser,
  getServerMembersWithRoles,
  type MemberWithRoles,
} from "@/lib/servers-api";
import {
  fetchProfileDetail,
  type ProfileDetailResponse,
  sendDirectMessage,
  blockUser,
  upsertMentionMute,
  type MentionMuteDuration,
} from "@/lib/api";

export type ServerInviteOption = {
  _id: string;
  name: string;
  avatarUrl?: string | null;
};

export type ChannelProfileAnchorContext = {
  anchorRect: DOMRect;
  serverId: string;
  serverName: string;
  serverAvatarUrl?: string | null;
  targetUserId: string;
  /** Biệt danh trong máy chủ hiện tại (nếu có). */
  nicknameInChannel?: string | null;
  fallbackDisplayName: string;
  fallbackUsername: string;
  fallbackAvatarUrl?: string;
};

type Props = {
  open: boolean;
  context: ChannelProfileAnchorContext | null;
  token: string;
  onClose: () => void;
  /** Chuyển sang DM với user (đã gửi tin nếu cần). */
  onOpenDirectMessage: (friend: Friend, opts?: { openGifPicker?: boolean }) => void;
  onToast?: (message: string) => void;
  /** Máy chủ bạn tham gia (trừ máy chủ hiện tại) để mời người này. */
  inviteableServers: ServerInviteOption[];
};

/** Trùng với `ConnectionStatus` của discord-card-react (dnd = chấm đỏ). */
type CardConnectionStatus = "online" | "idle" | "dnd" | "offline";

const BANNER_WHITE_SVG = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="240"><rect width="640" height="240" fill="#ffffff"/></svg>',
)}`;
const BANNER_BLACK_SVG = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="240"><rect width="640" height="240" fill="#000000"/></svg>',
)}`;
const AVATAR_FALLBACK = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#4e5058"/></svg>',
)}`;

/**
 * Online + có tương tác gần đây → xanh; online nhưng không hoạt động → vàng;
 * Offline (API) → xám; không có bản ghi member → xám.
 */
function deriveConnectionStatus(
  row: MemberWithRoles | null,
): CardConnectionStatus {
  if (!row) return "offline";
  if (!row.isOnline) return "offline";
  const windowMs = 10 * 60 * 1000;
  if (row.messagesLast10Min > 0) return "online";
  if (row.lastMessageAt) {
    const t = new Date(row.lastMessageAt).getTime();
    if (!Number.isNaN(t) && Date.now() - t < windowMs) return "online";
  }
  return "idle";
}

function computePopoverPosition(
  anchorRect: DOMRect,
  cardWidth: number,
  estimatedHeight: number,
): { left: number; top: number } {
  const margin = 8;
  const gap = 10;
  let left = anchorRect.right + gap;
  if (left + cardWidth > window.innerWidth - margin) {
    left = anchorRect.left - cardWidth - gap;
  }
  if (left < margin) {
    const centered = anchorRect.left + anchorRect.width / 2 - cardWidth / 2;
    left = Math.min(
      Math.max(margin, centered),
      window.innerWidth - cardWidth - margin,
    );
  }
  let top = anchorRect.top + anchorRect.height / 2 - estimatedHeight / 2;
  top = Math.max(
    margin,
    Math.min(top, window.innerHeight - estimatedHeight - margin),
  );
  return { left, top };
}

function toFriend(p: ProfileDetailResponse): Friend {
  return {
    _id: p.userId,
    displayName: p.displayName,
    username: p.username,
    avatarUrl: p.avatarUrl,
    email: "",
    bio: p.bio,
  };
}

const MUTE_DURATION_OPTIONS: { key: MentionMuteDuration; label: string }[] = [
  { key: "15m", label: "Trong vòng 15 phút" },
  { key: "1h", label: "Trong vòng 1 giờ" },
  { key: "3h", label: "Trong vòng 3 giờ" },
  { key: "8h", label: "Trong vòng 8 giờ" },
  { key: "24h", label: "Trong vòng 24 giờ" },
  { key: "forever", label: "Cho đến khi bật lại" },
];

export default function ChannelUserProfileRoot({
  open,
  context,
  token,
  onClose,
  onOpenDirectMessage,
  onToast,
  inviteableServers,
}: Props) {
  const [view, setView] = useState<"mini" | "full">("mini");
  const [profile, setProfile] = useState<ProfileDetailResponse | null>(null);
  const [memberRow, setMemberRow] = useState<MemberWithRoles | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [miniMessage, setMiniMessage] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [fullMoreOpen, setFullMoreOpen] = useState(false);
  const [muteSubOpen, setMuteSubOpen] = useState(false);
  const [inviteServerModalOpen, setInviteServerModalOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const fullMoreRef = useRef<HTMLDivElement>(null);
  const muteSubRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const [fullTab, setFullTab] = useState<"activity" | "follow" | "servers">(
    "activity",
  );

  useEffect(() => {
    if (!open || !context) return;
    setView("mini");
    setMiniMessage("");
    setMoreOpen(false);
    setFullMoreOpen(false);
    setMuteSubOpen(false);
    setInviteServerModalOpen(false);
    setFullTab("activity");
    setLoadError(null);
    setProfile(null);
    setMemberRow(null);
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [p, membersPack] = await Promise.all([
          fetchProfileDetail({ token, id: context.targetUserId }),
          getServerMembersWithRoles(context.serverId),
        ]);
        if (cancelled) return;
        setProfile(p);
        const row = membersPack.members.find(
          (m) => String(m.userId) === String(context.targetUserId),
        );
        setMemberRow(row ?? null);
      } catch (e) {
        if (!cancelled) {
          setLoadError(
            e instanceof Error ? e.message : "Không tải được hồ sơ",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, context, token]);

  useEffect(() => {
    if (!moreOpen && !fullMoreOpen && !inviteServerModalOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        moreOpen &&
        moreRef.current &&
        !moreRef.current.contains(t) &&
        !muteSubRef.current?.contains(t)
      ) {
        setMoreOpen(false);
        setMuteSubOpen(false);
      }
      if (fullMoreOpen && fullMoreRef.current && !fullMoreRef.current.contains(t)) {
        setFullMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [moreOpen, fullMoreOpen, inviteServerModalOpen]);

  const toast = useCallback(
    (m: string) => {
      onToast?.(m);
    },
    [onToast],
  );

  const friend = useMemo(
    () => (profile ? toFriend(profile) : null),
    [profile],
  );

  const displayName = useMemo(() => {
    if (!context) return "";
    const nick = context.nicknameInChannel?.trim();
    if (nick) return nick;
    return profile?.displayName || context.fallbackDisplayName;
  }, [context, profile]);

  const usernameLabel = profile?.username || context?.fallbackUsername || "";

  const bannerUrl = useMemo(() => {
    const cover = profile?.coverUrl?.trim();
    if (cover) return cover;
    return theme === "dark" ? BANNER_WHITE_SVG : BANNER_BLACK_SVG;
  }, [profile?.coverUrl, theme]);

  const avatarUrl = useMemo(
    () =>
      profile?.avatarUrl ||
      context?.fallbackAvatarUrl ||
      AVATAR_FALLBACK,
    [profile?.avatarUrl, context?.fallbackAvatarUrl],
  );

  const cardSurface = theme === "dark" ? "#1e1f22" : "#ebedef";
  const messageAccent = theme === "dark" ? "#3f4147" : "#b2bac7";

  const connectionStatus = useMemo(
    () => deriveConnectionStatus(memberRow),
    [memberRow],
  );

  const roleItems = useMemo(() => {
    const roles = memberRow?.roles || [];
    return roles.map((r) => ({
      name: r.name,
      color: r.color && r.color !== "#00000000" ? r.color : "#99AAB5",
    }));
  }, [memberRow]);

  const serverJoinedLabel = useMemo(() => {
    if (!memberRow?.joinedAt) return "—";
    return new Date(memberRow.joinedAt).toLocaleDateString("vi-VN");
  }, [memberRow?.joinedAt]);

  const mutualLine = useMemo(() => {
    const n = profile?.mutualServerCount ?? 0;
    if (n <= 0) return null;
    return { text: `${n} máy chủ chung` };
  }, [profile?.mutualServerCount]);

  const handleSendMini = useCallback(async () => {
    const text = miniMessage.trim();
    if (!text || !friend) {
      toast("Nhập tin nhắn trước khi gửi.");
      return;
    }
    try {
      await sendDirectMessage(friend._id, { content: text, token });
      onOpenDirectMessage(friend, {});
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Không gửi được tin nhắn");
    }
  }, [miniMessage, friend, token, onOpenDirectMessage, onClose, toast]);

  const handleGifMini = useCallback(() => {
    if (!friend) return;
    onOpenDirectMessage(friend, { openGifPicker: true });
    onClose();
  }, [friend, onOpenDirectMessage, onClose]);

  const handleInviteToServer = useCallback(
    async (serverId: string) => {
      if (!friend) return;
      try {
        await createServerInvite(serverId, friend._id);
        toast("Đã gửi lời mời vào máy chủ.");
        setInviteServerModalOpen(false);
        setMoreOpen(false);
        setFullMoreOpen(false);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Không gửi được lời mời");
      }
    },
    [friend, toast],
  );

  const handleMuteApply = useCallback(
    async (duration: MentionMuteDuration) => {
      if (!friend) return;
      try {
        await upsertMentionMute({
          token,
          mutedUserId: friend._id,
          duration,
        });
        toast("Đã tắt thông báo khi bị @ từ người này.");
        setMuteSubOpen(false);
        setMoreOpen(false);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Không lưu được");
      }
    },
    [friend, token, toast],
  );

  const handleBlock = useCallback(async () => {
    if (!friend) return;
    if (!window.confirm("Chặn người dùng này?")) return;
    try {
      await blockUser({ token, userId: friend._id });
      toast("Đã chặn.");
      setMoreOpen(false);
      setFullMoreOpen(false);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Không chặn được");
    }
  }, [friend, token, onClose, toast]);

  if (!open || !context || typeof document === "undefined") return null;

  const { anchorRect } = context;
  const POPUP_MINI_W = 328;
  const miniPos = computePopoverPosition(anchorRect, POPUP_MINI_W, 500);

  const mutualFollowCount = profile?.mutualFollowCount ?? 0;
  const mutualFollowUsers = profile?.mutualFollowUsers ?? [];
  const mutualServerCount = profile?.mutualServerCount ?? 0;
  const mutualServersList = profile?.mutualServers ?? [];

  const serverAvatarOk = (url: string | null | undefined) =>
    Boolean(url && /^https?:\/\//i.test(url.trim()));

  const miniMoreDropdown = profile && friend ? (
    <div className={styles.dropdown}>
      <button
        type="button"
        className={`${styles.dropdownItem} ${styles.dropdownItemRow}`}
        onClick={() => {
          setInviteServerModalOpen(true);
          setMoreOpen(false);
          setMuteSubOpen(false);
        }}
      >
        <span>Mời vào máy chủ</span>
        <span className={styles.menuChevron}>›</span>
      </button>
      <div className={styles.subMenuAnchor} ref={muteSubRef}>
        <button
          type="button"
          className={`${styles.dropdownItem} ${styles.dropdownItemRow}`}
          onClick={() => setMuteSubOpen((v) => !v)}
        >
          <span>Tắt thông báo</span>
          <span className={styles.menuChevron}>›</span>
        </button>
        {muteSubOpen ? (
          <div className={styles.subDropdown}>
            {MUTE_DURATION_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={styles.subDropdownItem}
                onClick={() => void handleMuteApply(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className={styles.dropdownSep} />
      <button
        type="button"
        className={`${styles.dropdownItem} ${styles.danger}`}
        onClick={() => void handleBlock()}
      >
        Chặn
      </button>
    </div>
  ) : null;

  const inviteServerModal =
    inviteServerModalOpen && friend ? (
      <div
        className={styles.inviteModalBackdrop}
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setInviteServerModalOpen(false);
        }}
      >
        <div
          className={styles.inviteModalCard}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <h3 className={styles.inviteModalTitle}>Mời vào máy chủ</h3>
          <p className={styles.inviteModalHint}>
            Chọn máy chủ để gửi lời mời tới {displayName}.
          </p>
          <ul className={styles.inviteServerList}>
            {inviteableServers.length === 0 ? (
              <li className={styles.inviteServerEmpty}>
                Không có máy chủ khác để mời.
              </li>
            ) : (
              inviteableServers.map((s) => (
                <li key={s._id}>
                  <button
                    type="button"
                    className={styles.inviteServerRow}
                    onClick={() => void handleInviteToServer(s._id)}
                  >
                    <span className={styles.inviteServerName}>{s.name}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <button
            type="button"
            className={styles.inviteModalClose}
            onClick={() => setInviteServerModalOpen(false)}
          >
            Đóng
          </button>
        </div>
      </div>
    ) : null;

  const card = view === "full" && profile && friend ? (
    <div
      className={styles.fullModalBackdrop}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {inviteServerModal}
      <div
        className={`${styles.fullModalCard} ${theme === "light" ? styles.popoverLight : ""}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={styles.fullModalCloseX}
          aria-label="Đóng"
          onClick={onClose}
        >
          ×
        </button>
        <div className={styles.fullModalGrid}>
          <div className={styles.fullModalLeft}>
            <div className={styles.fullModalBanner}>
              <img src={bannerUrl} alt="" className={styles.fullModalBannerImg} />
            </div>
            <div className={styles.fullModalAvatarWrap}>
              <img
                src={avatarUrl}
                alt=""
                className={styles.fullModalAvatarImg}
              />
              <span
                className={`${styles.fullStatusDot} ${styles[`status_${connectionStatus}`]}`}
                aria-hidden
              />
            </div>
            <h2 className={styles.fullDisplayName}>{displayName}</h2>
            <p className={styles.fullUsername}>@{usernameLabel}</p>
            <div className={styles.fullActionRow}>
              {profile.isFollowing ? (
                <button
                  type="button"
                  className={styles.followBtnSecondary}
                  onClick={async () => {
                    try {
                      await unfollowUser(profile.userId);
                      const p = await fetchProfileDetail({
                        token,
                        id: profile.userId,
                      });
                      setProfile(p);
                      toast("Đã bỏ theo dõi.");
                    } catch (e) {
                      toast(
                        e instanceof Error
                          ? e.message
                          : "Không bỏ theo dõi được",
                      );
                    }
                  }}
                >
                  Bỏ theo dõi
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.followBtn}
                  onClick={async () => {
                    try {
                      await followUser(profile.userId);
                      const p = await fetchProfileDetail({
                        token,
                        id: profile.userId,
                      });
                      setProfile(p);
                      toast("Đã theo dõi.");
                    } catch (e) {
                      toast(
                        e instanceof Error
                          ? e.message
                          : "Không theo dõi được",
                      );
                    }
                  }}
                >
                  Theo dõi
                </button>
              )}
              <button
                type="button"
                className={styles.fullMsgBtn}
                onClick={() => {
                  onOpenDirectMessage(friend, {});
                  onClose();
                }}
              >
                Nhắn tin
              </button>
            </div>
            <p className={styles.fullJoinLine}>
              <strong>{context.serverName}</strong>
              {" · "}
              Tham gia {serverJoinedLabel}
            </p>
            {roleItems.length > 0 ? (
              <div className={styles.fullRolesSection}>
                <h4 className={styles.fullRolesTitle}>Vai trò trong máy chủ</h4>
                <div className={styles.fullRolesList}>
                  {roleItems.map((r, idx) => (
                    <span
                      key={`${r.name}-${idx}`}
                      className={styles.roleChip}
                      style={{ borderColor: r.color, color: r.color }}
                    >
                      {r.name}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className={styles.fullModalRight}>
            <div className={styles.fullTabRow}>
              <button
                type="button"
                className={
                  fullTab === "activity"
                    ? styles.fullTabActive
                    : styles.fullTab
                }
                onClick={() => setFullTab("activity")}
              >
                Hoạt động
              </button>
              <button
                type="button"
                className={
                  fullTab === "follow"
                    ? styles.fullTabActive
                    : styles.fullTab
                }
                onClick={() => setFullTab("follow")}
              >
                Follow chung ({mutualFollowCount})
              </button>
              <button
                type="button"
                className={
                  fullTab === "servers"
                    ? styles.fullTabActive
                    : styles.fullTab
                }
                onClick={() => setFullTab("servers")}
              >
                {mutualServerCount} máy chủ chung
              </button>
            </div>
            <div className={styles.fullTabPanel}>
              {fullTab === "activity" ? (
                <p className={styles.fullTabPlaceholder}>
                  Phần hoạt động sẽ được bổ sung sau.
                </p>
              ) : fullTab === "follow" ? (
                mutualFollowCount === 0 ? (
                  <p className={styles.fullTabBody}>Không có follow chung.</p>
                ) : mutualFollowUsers.length > 0 ? (
                  <ul className={styles.mutualServerList}>
                    {mutualFollowUsers.map((u) => (
                      <li key={u.userId} className={styles.mutualServerRow}>
                        <img
                          src={u.avatarUrl || AVATAR_FALLBACK}
                          alt=""
                          className={styles.mutualServerAvatar}
                        />
                        <div className={styles.mutualFollowTextCol}>
                          <span className={styles.mutualServerName}>
                            {u.displayName}
                          </span>
                          <span className={styles.mutualFollowSub}>
                            @{u.username}
                          </span>
                        </div>
                      </li>
                    ))}
                    {mutualFollowCount > mutualFollowUsers.length ? (
                      <li className={styles.mutualFollowMoreHint}>
                        +{mutualFollowCount - mutualFollowUsers.length} người
                        khác…
                      </li>
                    ) : null}
                  </ul>
                ) : (
                  <p className={styles.fullTabBody}>
                    Có {mutualFollowCount} người theo dõi cả hai bạn.
                  </p>
                )
              ) : mutualServersList.length > 0 ? (
                <ul className={styles.mutualServerList}>
                  {mutualServersList.map((s) => (
                    <li key={s.serverId} className={styles.mutualServerRow}>
                      {serverAvatarOk(s.avatarUrl) ? (
                        <img
                          src={s.avatarUrl!}
                          alt=""
                          className={styles.mutualServerAvatar}
                        />
                      ) : (
                        <div className={styles.mutualServerAvatarPh}>
                          {(s.name || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className={styles.mutualServerName}>{s.name}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.fullTabBody}>Không có máy chủ chung.</p>
              )}
            </div>
          </div>
        </div>
        <div className={styles.fullModalToolbar}>
          <div className={styles.moreWrap} ref={fullMoreRef}>
            <button
              type="button"
              className={styles.profileIconBtn}
              aria-label="Thêm"
              onClick={() => setFullMoreOpen((v) => !v)}
            >
              ⋯
            </button>
            {fullMoreOpen ? (
              <div className={styles.dropdown}>
                <button
                  type="button"
                  className={styles.dropdownItem}
                  onClick={() => {
                    setFullMoreOpen(false);
                    setView("mini");
                  }}
                >
                  Xem hồ sơ chính
                </button>
                <button
                  type="button"
                  className={`${styles.dropdownItem} ${styles.dropdownItemRow}`}
                  onClick={() => {
                    setFullMoreOpen(false);
                    setInviteServerModalOpen(true);
                  }}
                >
                  <span>Mời vào máy chủ</span>
                  <span className={styles.menuChevron}>›</span>
                </button>
                <div className={styles.dropdownSep} />
                <button
                  type="button"
                  className={`${styles.dropdownItem} ${styles.danger}`}
                  onClick={() => void handleBlock()}
                >
                  Chặn
                </button>
                <button
                  type="button"
                  className={`${styles.dropdownItem} ${styles.danger}`}
                  onClick={() => {
                    setFullMoreOpen(false);
                    toast(
                      "Báo cáo: dùng mục Báo cáo trên tin nhắn hoặc Trung tâm hỗ trợ.",
                    );
                  }}
                >
                  Báo cáo hồ sơ người dùng
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  ) : (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {inviteServerModal}
      <div
        className={`${styles.popoverWrap} ${styles.popoverMini} ${theme === "light" ? styles.popoverLight : ""}`}
        style={{ left: miniPos.left, top: miniPos.top, width: POPUP_MINI_W }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDownCapture={(e) => {
          if (e.key === "Enter" && (e.target as HTMLElement)?.tagName === "TEXTAREA") {
            if (!(e as React.KeyboardEvent).shiftKey) {
              e.preventDefault();
              void handleSendMini();
            }
          }
        }}
      >
        {loadError ? (
          <div className={styles.errorBox}>{loadError}</div>
        ) : loading || !profile ? (
          <div className={styles.loadingBox}>Đang tải…</div>
        ) : (
          <div className={styles.miniCardShell}>
            <div className={styles.cardTopActions}>
              <button
                type="button"
                className={styles.profileTextBtn}
                onClick={() => setView("full")}
                title="Hồ sơ trong máy chủ"
              >
                Hồ sơ
              </button>
              <div className={styles.moreWrap} ref={moreRef}>
                <button
                  type="button"
                  className={styles.profileIconBtn}
                  aria-label="Thêm"
                  onClick={() => setMoreOpen((v) => !v)}
                >
                  ⋯
                </button>
                {moreOpen ? miniMoreDropdown : null}
              </div>
            </div>
            <DiscordCard
              imageUrl={avatarUrl}
              bannerUrl={bannerUrl}
              primaryColor={cardSurface}
              accentColor={cardSurface}
              connectionStatus={connectionStatus}
              basicInfo={{
                displayname: displayName,
                username: usernameLabel,
              }}
              aboutMe={
                mutualLine
                  ? { title: "Máy chủ", items: [mutualLine] }
                  : undefined
              }
              roles={
                roleItems.length
                  ? { title: "Vai trò", roles: roleItems }
                  : undefined
              }
              message={{
                message: miniMessage,
                handleInput: (e) => setMiniMessage(e.target.value),
                placeholder: `Tin nhắn @${displayName}`,
                accentColor: messageAccent,
              }}
            >
              <div className={styles.gifRow}>
                <button
                  type="button"
                  className={styles.gifBtn}
                  onClick={handleGifMini}
                >
                  GIF
                </button>
              </div>
            </DiscordCard>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(card, document.body);
}
