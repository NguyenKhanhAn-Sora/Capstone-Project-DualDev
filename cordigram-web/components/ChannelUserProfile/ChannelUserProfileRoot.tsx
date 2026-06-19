"use client";

import { appAlert, appConfirm, appPrompt } from "@/lib/app-dialog";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useLanguage, localeTagForLanguage } from "@/component/language-provider";
import { useMessagesUiTone } from "@/hooks/use-messages-ui-tone";
import { syncMessagesChromeVars } from "@/lib/messages-appearance-chrome";
import styles from "./ChannelUserProfileRoot.module.css";
import type { Friend } from "@/lib/servers-api";
import { parseUserCover } from "@/lib/user-profile-cover";
import { buildProfileCardThemeVars } from "@/lib/profile-theme";
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
  /** Quyền quản lý biệt danh (manageNicknames) — hiện nút Đổi Biệt Danh thay vì Bỏ qua. */
  canManageNicknames?: boolean;
  /** Callback khi muốn đổi biệt danh cho user. */
  onChangeNickname?: (userId: string, currentNickname: string | null) => void;
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

function getDisplayNameTextStyle(source?: {
  displayNameFontId?: string | null;
  displayNameEffectId?: string | null;
  displayNamePrimaryHex?: string | null;
  displayNameAccentHex?: string | null;
}): React.CSSProperties | undefined {
  if (!source) return undefined;
  const primary = /^#[0-9a-f]{6}$/i.test(String(source.displayNamePrimaryHex || ""))
    ? String(source.displayNamePrimaryHex)
    : "#F2F3F5";
  const accent = /^#[0-9a-f]{6}$/i.test(String(source.displayNameAccentHex || ""))
    ? String(source.displayNameAccentHex)
    : "#5865F2";
  const fontFamily =
    source.displayNameFontId === "mono"
      ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
      : source.displayNameFontId === "rounded"
        ? 'ui-rounded, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'
        : undefined;
  if (source.displayNameEffectId === "gradient") {
    return {
      backgroundImage: `linear-gradient(0deg, ${primary}, ${accent})`,
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent",
      fontFamily,
    };
  }
  if (source.displayNameEffectId === "neon") {
    return {
      color: primary,
      textShadow: `0 0 10px ${accent}, 0 0 18px ${accent}`,
      fontFamily,
    };
  }
  return { color: primary, fontFamily };
}

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

function IconUserAdd({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M14 8a4 4 0 1 0-8 0 4 4 0 0 0 8 0Zm-6 6a6 6 0 0 0-6 6 1 1 0 0 0 1 1h10a1 1 0 0 0 1-1 6 6 0 0 0-6-6Zm9.5-2.5a1 1 0 0 0-1 1V13h-2.5a1 1 0 1 0 0 2H16v2.5a1 1 0 1 0 2 0V15h2.5a1 1 0 1 0 0-2H18v-2.5a1 1 0 0 0-1-1Z" />
    </svg>
  );
}

function IconMore({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

function IconMessage({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4.5 5.5A3 3 0 0 1 7.5 2.5h9a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-5.2l-3.8 3.2a1 1 0 0 1-1.6-.8V15.5h-.5a3 3 0 0 1-3-3v-7Z" />
    </svg>
  );
}

function IconPhone({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8.2 3.5c.4-.9 1.5-1.2 2.3-.6l1.4 1.1c.7.6.9 1.6.4 2.4l-.8 1.3c-.2.4-.1.9.2 1.2 1.5 1.5 3.2 2.8 5.1 3.8.4.2.9.1 1.2-.2l1.3-.8c.8-.5 1.8-.3 2.4.4l1.1 1.4c.6.8.3 1.9-.6 2.3-1.2.5-2.5.8-3.8.8-5.2 0-10.4-4.2-11.6-9.4-.2-.9-.2-1.8 0-2.7Z" />
    </svg>
  );
}

function IconSmile({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-4.5 8.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm7.5 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0ZM8.2 15.8c1.1 1.4 2.6 2.2 3.8 2.2s2.7-.8 3.8-2.2a1 1 0 1 0-1.6-1.2c-.7.9-1.5 1.4-2.2 1.4s-1.5-.5-2.2-1.4a1 1 0 0 0-1.6 1.2Z" />
    </svg>
  );
}

const MUTE_DURATION_KEYS: MentionMuteDuration[] = [
  "15m",
  "1h",
  "3h",
  "8h",
  "24h",
  "forever",
];

const MORE_MENU_WIDTH = 240;
const MORE_MENU_MAX_HEIGHT = 320;

function computeFloatingMenuPosition(anchor: DOMRect): { top: number; left: number } {
  const pad = 8;
  const menuW = MORE_MENU_WIDTH;
  const menuH = MORE_MENU_MAX_HEIGHT;
  let left = anchor.right - menuW;
  let top = anchor.bottom + 6;
  if (left < pad) left = pad;
  if (left + menuW > window.innerWidth - pad) {
    left = Math.max(pad, window.innerWidth - menuW - pad);
  }
  if (top + menuH > window.innerHeight - pad) {
    top = Math.max(pad, anchor.top - menuH - 6);
  }
  return { top, left };
}

export default function ChannelUserProfileRoot({
  open,
  context,
  token,
  onClose,
  onOpenDirectMessage,
  onToast,
  inviteableServers,
  canManageNicknames = false,
  onChangeNickname,
}: Props) {
  const [view, setView] = useState<"mini" | "full">("mini");
  const [profile, setProfile] = useState<ProfileDetailResponse | null>(null);
  const [memberRow, setMemberRow] = useState<MemberWithRoles | null>(null);
  const [serverCoverOverride, setServerCoverOverride] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [miniMessage, setMiniMessage] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [fullMoreOpen, setFullMoreOpen] = useState(false);
  const [muteSubOpen, setMuteSubOpen] = useState(false);
  const [inviteServerModalOpen, setInviteServerModalOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const fullMoreRef = useRef<HTMLDivElement>(null);
  const fullMoreBtnRef = useRef<HTMLButtonElement>(null);
  const fullMoreMenuRef = useRef<HTMLDivElement>(null);
  const muteSubRef = useRef<HTMLDivElement>(null);
  const popoverChromeRef = useRef<HTMLDivElement>(null);
  const [miniMenuPos, setMiniMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [fullMenuPos, setFullMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const messagesUiTone = useMessagesUiTone();
  const { t, language } = useLanguage();
  const [fullTab, setFullTab] = useState<"follow" | "servers">("follow");

  const muteDurationOptions = useMemo(
    () =>
      MUTE_DURATION_KEYS.map((key) => ({
        key,
        label: t(`chat.channelUserProfile.mute.${key}`),
      })),
    [t],
  );

  useEffect(() => {
    if (!open || !context) return;
    setView("mini");
    setMiniMessage("");
    setMoreOpen(false);
    setFullMoreOpen(false);
    setMuteSubOpen(false);
    setInviteServerModalOpen(false);
    setFullTab("follow");
    setLoadError(null);
    setProfile(null);
    setMemberRow(null);
    setServerCoverOverride(null);
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
        setServerCoverOverride((row as any)?.coverUrl ?? null);
      } catch (e) {
        if (!cancelled) {
          setLoadError(
            e instanceof Error
              ? e.message
              : t("chat.channelUserProfile.loadError"),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, context, token, t]);

  useEffect(() => {
    const onUpdated = (e: Event) => {
      if (!open || !context) return;
      const ce = e as CustomEvent;
      const d = (ce?.detail ?? {}) as {
        serverId?: string;
        userId?: string;
        avatarUrl?: string | null;
        coverUrl?: string | null;
        profileThemePrimaryHex?: string | null;
        profileThemeAccentHex?: string | null;
      };
      if (!d?.serverId || !d?.userId) return;
      if (d.serverId !== context.serverId) return;
      if (String(d.userId) !== String(context.targetUserId)) return;
      if ("avatarUrl" in d) {
        setMemberRow((prev) =>
          prev ? ({ ...prev, avatarUrl: d.avatarUrl ?? prev.avatarUrl } as any) : prev,
        );
      }
      if ("coverUrl" in d) {
        setServerCoverOverride(d.coverUrl ?? null);
      }
      if ("profileThemePrimaryHex" in d || "profileThemeAccentHex" in d) {
        setMemberRow((prev) =>
          prev
            ? ({
                ...prev,
                profileThemePrimaryHex:
                  "profileThemePrimaryHex" in d
                    ? (d.profileThemePrimaryHex ?? null)
                    : prev.profileThemePrimaryHex,
                profileThemeAccentHex:
                  "profileThemeAccentHex" in d
                    ? (d.profileThemeAccentHex ?? null)
                    : prev.profileThemeAccentHex,
              } as any)
            : prev,
        );
      }
    };
    window.addEventListener("cordigram-server-member-profile-updated", onUpdated as any);
    return () =>
      window.removeEventListener("cordigram-server-member-profile-updated", onUpdated as any);
  }, [open, context]);

  useEffect(() => {
    const onStyle = (e: Event) => {
      if (!open || !context) return;
      const ce = e as CustomEvent;
      const d = (ce?.detail ?? {}) as {
        userId?: string;
        avatarUrl?: string | null;
        displayName?: string;
        username?: string;
      };
      if (!d?.userId) return;
      if (String(d.userId) !== String(context.targetUserId)) return;
      if ("avatarUrl" in d) {
        setProfile((prev) =>
          prev ? ({ ...prev, avatarUrl: d.avatarUrl ?? prev.avatarUrl } as any) : prev,
        );
        setMemberRow((prev) =>
          prev ? ({ ...prev, avatarUrl: d.avatarUrl ?? prev.avatarUrl } as any) : prev,
        );
      }
      if (d.displayName) {
        setProfile((prev) => (prev ? ({ ...prev, displayName: d.displayName } as any) : prev));
      }
      if (d.username) {
        setProfile((prev) => (prev ? ({ ...prev, username: d.username } as any) : prev));
      }
    };
    window.addEventListener("cordigram-user-profile-style-updated", onStyle as any);
    return () =>
      window.removeEventListener("cordigram-user-profile-style-updated", onStyle as any);
  }, [open, context]);

  useEffect(() => {
    if (!open) return;
    const sync = () => {
      if (popoverChromeRef.current) {
        syncMessagesChromeVars(popoverChromeRef.current);
      }
      if (moreMenuRef.current) syncMessagesChromeVars(moreMenuRef.current);
      if (fullMoreMenuRef.current) syncMessagesChromeVars(fullMoreMenuRef.current);
    };
    sync();
    window.addEventListener("cordigram-messages-chrome", sync);
    window.addEventListener("cordigram-messages-shell-theme", sync);
    window.addEventListener("cordigram-chat-settings", sync);
    return () => {
      window.removeEventListener("cordigram-messages-chrome", sync);
      window.removeEventListener("cordigram-messages-shell-theme", sync);
      window.removeEventListener("cordigram-chat-settings", sync);
    };
  }, [open, moreOpen, fullMoreOpen]);

  useLayoutEffect(() => {
    if (!moreOpen) {
      setMiniMenuPos(null);
      return;
    }
    const update = () => {
      const btn = moreBtnRef.current;
      if (!btn) return;
      setMiniMenuPos(computeFloatingMenuPosition(btn.getBoundingClientRect()));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [moreOpen]);

  useLayoutEffect(() => {
    if (!fullMoreOpen) {
      setFullMenuPos(null);
      return;
    }
    const update = () => {
      const btn = fullMoreBtnRef.current;
      if (!btn) return;
      setFullMenuPos(computeFloatingMenuPosition(btn.getBoundingClientRect()));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [fullMoreOpen]);

  useLayoutEffect(() => {
    if (moreOpen && moreMenuRef.current) {
      syncMessagesChromeVars(moreMenuRef.current);
    }
  }, [moreOpen, miniMenuPos]);

  useLayoutEffect(() => {
    if (fullMoreOpen && fullMoreMenuRef.current) {
      syncMessagesChromeVars(fullMoreMenuRef.current);
    }
  }, [fullMoreOpen, fullMenuPos]);

  useEffect(() => {
    if (!moreOpen && !fullMoreOpen && !inviteServerModalOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        moreOpen &&
        !moreRef.current?.contains(t) &&
        !moreMenuRef.current?.contains(t) &&
        !muteSubRef.current?.contains(t)
      ) {
        setMoreOpen(false);
        setMuteSubOpen(false);
      }
      if (
        fullMoreOpen &&
        !fullMoreRef.current?.contains(t) &&
        !fullMoreMenuRef.current?.contains(t) &&
        !muteSubRef.current?.contains(t)
      ) {
        setFullMoreOpen(false);
        setMuteSubOpen(false);
      }
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
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

  const bannerPresentation = useMemo(() => {
    const cover = (serverCoverOverride ?? "").trim();
    const parsed = parseUserCover(cover);
    if (parsed.bannerImageUrl) {
      return { kind: "image" as const, src: parsed.bannerImageUrl };
    }
    if (cover.startsWith("data:image/svg+xml")) {
      return {
        kind: "solid" as const,
        style: { background: parsed.bannerSolidHex } as React.CSSProperties,
      };
    }
    const placeholder =
      messagesUiTone === "dark" ? BANNER_WHITE_SVG : BANNER_BLACK_SVG;
    return { kind: "placeholder" as const, src: placeholder };
  }, [messagesUiTone, serverCoverOverride]);

  const avatarUrl = useMemo(
    () =>
      memberRow?.avatarUrl ||
      context?.fallbackAvatarUrl ||
      AVATAR_FALLBACK,
    [memberRow?.avatarUrl, context?.fallbackAvatarUrl],
  );

  const connectionStatus = useMemo(
    () => deriveConnectionStatus(memberRow),
    [memberRow],
  );

  const cardThemeStyle = useMemo(
    () =>
      buildProfileCardThemeVars(
        memberRow?.profileThemePrimaryHex,
        memberRow?.profileThemeAccentHex,
      ),
    [memberRow?.profileThemePrimaryHex, memberRow?.profileThemeAccentHex],
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
    return new Date(memberRow.joinedAt).toLocaleDateString(
      localeTagForLanguage(language),
    );
  }, [memberRow?.joinedAt, language]);

  const handleSendMini = useCallback(async () => {
    const text = miniMessage.trim();
    if (!text || !friend) {
      toast(t("chat.channelUserProfile.toastMessageEmpty"));
      return;
    }
    try {
      await sendDirectMessage(friend._id, { content: text, token });
      onOpenDirectMessage(friend, {});
      onClose();
    } catch (e) {
      toast(
        e instanceof Error ? e.message : t("chat.channelUserProfile.toastMessageError"),
      );
    }
  }, [miniMessage, friend, token, onOpenDirectMessage, onClose, toast, t]);

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
        toast(t("chat.channelUserProfile.toastInvite"));
        setInviteServerModalOpen(false);
        setMoreOpen(false);
        setFullMoreOpen(false);
      } catch (e) {
        toast(
          e instanceof Error ? e.message : t("chat.channelUserProfile.toastInviteError"),
        );
      }
    },
    [friend, toast, t],
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
        toast(t("chat.channelUserProfile.toastMute"));
        setMuteSubOpen(false);
        setMoreOpen(false);
      } catch (e) {
        toast(
          e instanceof Error ? e.message : t("chat.channelUserProfile.toastMuteError"),
        );
      }
    },
    [friend, token, toast, t],
  );

  const handleBlock = useCallback(async () => {
    if (!friend) return;
    if (!await appConfirm(t("chat.channelUserProfile.toastBlockConfirm"))) return;
    try {
      await blockUser({ token, userId: friend._id });
      toast(t("chat.channelUserProfile.toastBlocked"));
      setMoreOpen(false);
      setFullMoreOpen(false);
      onClose();
    } catch (e) {
      toast(
        e instanceof Error ? e.message : t("chat.channelUserProfile.toastBlockError"),
      );
    }
  }, [friend, token, onClose, toast, t]);

  if (!open || !context || typeof document === "undefined") return null;

  const { anchorRect } = context;
  const POPUP_MINI_W = 340;
  const miniPos = computePopoverPosition(anchorRect, POPUP_MINI_W, 540);

  const mutualFollowCount = profile?.mutualFollowCount ?? 0;
  const mutualFollowUsers = profile?.mutualFollowUsers ?? [];
  const mutualServerCount = profile?.mutualServerCount ?? 0;
  const mutualServersList = profile?.mutualServers ?? [];

  const serverAvatarOk = (url: string | null | undefined) =>
    Boolean(url && /^https?:\/\//i.test(url.trim()));

  const isPlaceholderBanner = bannerPresentation.kind === "placeholder";

  const handleFollow = async () => {
    if (!profile) return;
    try {
      await followUser(profile.userId);
      const p = await fetchProfileDetail({ token, id: profile.userId });
      setProfile(p);
      toast(t("chat.channelUserProfile.toastFollow"));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("chat.channelUserProfile.toastFollowError"));
    }
  };

  const handleUnfollow = async () => {
    if (!profile) return;
    try {
      await unfollowUser(profile.userId);
      const p = await fetchProfileDetail({ token, id: profile.userId });
      setProfile(p);
      toast(t("chat.channelUserProfile.toastUnfollow"));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("chat.channelUserProfile.toastUnfollowError"));
    }
  };

  const renderMoreMenuInner = (opts: {
    onViewFull?: () => void;
    closeMore: () => void;
  }) => (
    <>
        {opts.onViewFull ? (
          <button
            type="button"
            className={styles.dropdownItem}
            onClick={() => {
              opts.onViewFull?.();
              opts.closeMore();
            }}
          >
            {t("chat.channelUserProfile.viewFullProfile")}
          </button>
        ) : null}
      <button
        type="button"
        className={`${styles.dropdownItem} ${styles.dropdownItemRow}`}
        onClick={() => {
          setInviteServerModalOpen(true);
          opts.closeMore();
          setMuteSubOpen(false);
        }}
      >
        <span>{t("chat.channelUserProfile.inviteToServer")}</span>
        <span className={styles.menuChevron}>›</span>
      </button>
      {canManageNicknames && friend && (
        <button
          type="button"
          className={styles.dropdownItem}
          onClick={() => {
            onChangeNickname?.(friend._id, context?.nicknameInChannel ?? null);
            opts.closeMore();
          }}
        >
          {t("chat.channelUserProfile.changeNickname")}
        </button>
      )}
      <div className={styles.dropdownSep} />
      <button
        type="button"
        className={`${styles.dropdownItem} ${styles.danger}`}
        onClick={() => void handleBlock()}
      >
        {t("chat.channelUserProfile.block")}
      </button>
      <button
        type="button"
        className={`${styles.dropdownItem} ${styles.danger}`}
        onClick={() => {
          opts.closeMore();
          toast(
            t("chat.channelUserProfile.toastReport"),
          );
        }}
      >
        {t("chat.channelUserProfile.reportProfile")}
      </button>
    </>
  );

  const renderMoreMenuPortal = (
    open: boolean,
    pos: { top: number; left: number } | null,
    menuRef: React.RefObject<HTMLDivElement | null>,
    opts: { onViewFull?: () => void; closeMore: () => void },
  ) => {
    if (!open || !pos || !profile || !friend) return null;
    return createPortal(
      <div
        ref={menuRef}
        role="menu"
        className={`${styles.dropdown} ${styles.dropdownFloating} ${messagesUiTone === "light" ? styles.popoverLight : ""}`}
        style={{ top: pos.top, left: pos.left, width: MORE_MENU_WIDTH }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {renderMoreMenuInner(opts)}
      </div>,
      document.body,
    );
  };

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
          <h3 className={styles.inviteModalTitle}>{t("chat.channelUserProfile.inviteModalTitle")}</h3>
          <p className={styles.inviteModalHint}>
            {t("chat.channelUserProfile.inviteModalHint", { name: displayName })}
          </p>
          <ul className={styles.inviteServerList}>
            {inviteableServers.length === 0 ? (
              <li className={styles.inviteServerEmpty}>
                {t("chat.channelUserProfile.inviteEmpty")}
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
            {t("chat.channelUserProfile.inviteClose")}
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
        ref={popoverChromeRef}
        className={`${styles.fullModalCard} ${messagesUiTone === "light" ? styles.popoverLight : ""}`}
        style={cardThemeStyle}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={styles.fullModalCloseX}
          aria-label={t("chat.channelUserProfile.close")}
          onClick={onClose}
        >
          ×
        </button>
        <div className={styles.fullModalGrid}>
          <div className={styles.fullModalLeft}>
            <div
              className={`${styles.fullModalBanner} ${isPlaceholderBanner ? styles.bannerFallback : ""}`}
              style={
                bannerPresentation.kind === "solid"
                  ? bannerPresentation.style
                  : undefined
              }
            >
              {bannerPresentation.kind !== "solid" ? (
                <img
                  src={bannerPresentation.src}
                  alt=""
                  className={styles.fullModalBannerImg}
                />
              ) : null}
            </div>
            <div className={styles.fullModalAvatarWrap}>
              <img src={avatarUrl} alt="" className={styles.fullModalAvatarImg} />
              <span
                className={`${styles.fullStatusDot} ${styles[`status_${connectionStatus}`]}`}
                aria-hidden
              />
            </div>
            <div className={styles.fullNameRow}>
              <h2
                className={styles.fullDisplayName}
                style={getDisplayNameTextStyle(profile)}
              >
                {displayName}
              </h2>
              {profile.isFollowing ? (
                <button
                  type="button"
                  className={styles.followBtnCompactSecondary}
                  onClick={() => void handleUnfollow()}
                >
                  {t("chat.channelUserProfile.unfollow")}
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.followBtnCompact}
                  onClick={() => void handleFollow()}
                >
                  {t("chat.channelUserProfile.follow")}
                </button>
              )}
            </div>
            <p className={styles.fullUsername}>@{usernameLabel}</p>
            <div className={styles.fullActionRow}>
              <button
                type="button"
                className={styles.fullIconActionBtn}
                aria-label={t("chat.channelUserProfile.message")}
                title={t("chat.channelUserProfile.message")}
                onClick={() => {
                  onOpenDirectMessage(friend, {});
                  onClose();
                }}
              >
                <IconMessage />
              </button>
              <div
                className={styles.moreWrap}
                ref={fullMoreRef}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  ref={fullMoreBtnRef}
                  type="button"
                  className={styles.fullIconActionBtn}
                  aria-label={t("chat.channelUserProfile.more")}
                  aria-haspopup="menu"
                  aria-expanded={fullMoreOpen}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMoreOpen(false);
                    setMuteSubOpen(false);
                    setFullMoreOpen((v) => !v);
                  }}
                >
                  <IconMore />
                </button>
              </div>
            </div>
            <div className={styles.fullJoinBlock}>
              <p className={styles.fullJoinHeading}>{t("chat.channelUserProfile.joinedFrom")}</p>
              {profile.cordigramMemberSince ? (
                <p className={styles.fullJoinItem}>
                  <span className={styles.joinDot} aria-hidden />
                  {profile.cordigramMemberSince}
                </p>
              ) : null}
              <p className={styles.fullJoinItem}>
                <span className={styles.joinDotServer} aria-hidden />
                {context.serverName} · {serverJoinedLabel}
              </p>
            </div>
            {roleItems.length > 0 ? (
              <div className={styles.fullRolesSection}>
                <h4 className={styles.fullRolesTitle}>{t("chat.channelUserProfile.roles")}</h4>
                <div className={styles.fullRolesList}>
                  {roleItems.map((r, idx) => (
                    <span key={`${r.name}-${idx}`} className={styles.roleChip}>
                      <span
                        className={styles.roleChipDot}
                        style={{ backgroundColor: r.color }}
                        aria-hidden
                      />
                      {r.name}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            <div className={styles.fullNotesSection}>
              <h4 className={styles.fullRolesTitle}>{t("chat.channelUserProfile.notesTitle")}</h4>
              <p className={styles.fullNotesPlaceholder}>{t("chat.channelUserProfile.notesPlaceholder")}</p>
            </div>
          </div>
          <div className={styles.fullModalRight}>
            <div className={styles.fullTabRow}>
              <button
                type="button"
                className={
                  fullTab === "follow"
                    ? styles.fullTabActive
                    : styles.fullTab
                }
                onClick={() => setFullTab("follow")}
              >
                {mutualFollowCount > 0
                  ? t("chat.channelUserProfile.tabMutualFollow", { count: mutualFollowCount })
                  : t("chat.channelUserProfile.tabNoMutualFollow")}
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
                {t("chat.channelUserProfile.tabMutualServers", { count: mutualServerCount })}
              </button>
            </div>
            <div className={styles.fullTabPanel}>
              {fullTab === "follow" ? (
                mutualFollowCount === 0 ? (
                  <p className={styles.fullTabBody}>{t("chat.channelUserProfile.noMutualFollow")}</p>
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
                        {t("chat.channelUserProfile.mutualFollowMore", {
                          count: mutualFollowCount - mutualFollowUsers.length,
                        })}
                      </li>
                    ) : null}
                  </ul>
                ) : (
                  <p className={styles.fullTabBody}>
                    {t("chat.channelUserProfile.mutualFollowSummary", { count: mutualFollowCount })}
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
                <p className={styles.fullTabBody}>{t("chat.channelUserProfile.noMutualServers")}</p>
              )}
            </div>
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
        ref={popoverChromeRef}
        className={`${styles.popoverWrap} ${styles.popoverMini} ${messagesUiTone === "light" ? styles.popoverLight : ""}`}
        style={{ left: miniPos.left, top: miniPos.top, width: POPUP_MINI_W, ...cardThemeStyle }}
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
          <div className={styles.loadingBox}>{t("chat.channelUserProfile.loading")}</div>
        ) : (
          <div className={styles.miniCard}>
            <div
              className={`${styles.miniBanner} ${isPlaceholderBanner ? styles.bannerFallback : ""}`}
              style={
                bannerPresentation.kind === "solid"
                  ? bannerPresentation.style
                  : undefined
              }
            >
              {bannerPresentation.kind !== "solid" ? (
              <div className={styles.miniBannerMedia}>
                <img
                  src={bannerPresentation.src}
                  alt=""
                  className={styles.miniBannerImg}
                />
              </div>
              ) : null}
              <div className={styles.miniBannerActions}>
                {!profile.isFollowing ? (
                  <button
                    type="button"
                    className={styles.bannerIconBtn}
                    aria-label={t("chat.channelUserProfile.addFriend")}
                    title={t("chat.channelUserProfile.addFriend")}
                    onClick={() => void handleFollow()}
                  >
                    <IconUserAdd />
                  </button>
                ) : null}
                <div
                  className={styles.moreWrap}
                  ref={moreRef}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    ref={moreBtnRef}
                    type="button"
                    className={styles.bannerIconBtn}
                    aria-label={t("chat.channelUserProfile.more")}
                    aria-haspopup="menu"
                    aria-expanded={moreOpen}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setFullMoreOpen(false);
                      setMuteSubOpen(false);
                      setMoreOpen((v) => !v);
                    }}
                  >
                    <IconMore />
                  </button>
                </div>
              </div>
            </div>
            <div className={styles.miniBody}>
              <div className={styles.miniAvatarWrap}>
                <img src={avatarUrl} alt="" className={styles.miniAvatarImg} />
                <span
                  className={`${styles.miniStatusDot} ${styles[`status_${connectionStatus}`]}`}
                  aria-hidden
                />
              </div>
              <h2
                className={styles.miniDisplayName}
                style={getDisplayNameTextStyle(profile)}
              >
                {displayName}
              </h2>
              <p className={styles.miniUsername}>{usernameLabel}</p>
              {mutualServerCount > 0 ? (
                <div className={styles.mutualRow}>
                  <div className={styles.mutualIcons} aria-hidden>
                    {mutualServersList.slice(0, 3).map((s) =>
                      serverAvatarOk(s.avatarUrl) ? (
                        <img
                          key={s.serverId}
                          src={s.avatarUrl!}
                          alt=""
                          className={styles.mutualIconImg}
                        />
                      ) : (
                        <span key={s.serverId} className={styles.mutualIconPh}>
                          {(s.name || "?").charAt(0).toUpperCase()}
                        </span>
                      ),
                    )}
                  </div>
                  <span className={styles.mutualText}>
                    {t("chat.channelUserProfile.mutualServers", { count: mutualServerCount })}
                  </span>
                </div>
              ) : null}
              <div className={styles.miniActionRow}>
                <button
                  type="button"
                  className={styles.miniActionBtn}
                  onClick={() => {
                    if (friend) onOpenDirectMessage(friend, {});
                    onClose();
                  }}
                >
                  <IconMessage />
                  {t("chat.channelUserProfile.message")}
                </button>
                <button
                  type="button"
                  className={styles.miniActionBtn}
                  onClick={() => {
                    if (friend) onOpenDirectMessage(friend, {});
                    onClose();
                  }}
                >
                  <IconPhone />
                  {t("chat.channelUserProfile.call")}
                </button>
              </div>
              {roleItems.length > 0 ? (
                <div className={styles.miniRoles}>
                  {roleItems.map((r, idx) => (
                    <span key={`${r.name}-${idx}`} className={styles.miniRoleChip}>
                      <span
                        className={styles.roleChipDot}
                        style={{ backgroundColor: r.color }}
                        aria-hidden
                      />
                      {r.name}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className={styles.miniMsgWrap}>
                <textarea
                  className={styles.miniMsgInput}
                  value={miniMessage}
                  onChange={(e) => setMiniMessage(e.target.value)}
                  placeholder={t("chat.channelUserProfile.messagePlaceholder", { name: displayName })}
                  rows={1}
                />
                <button
                  type="button"
                  className={styles.miniEmojiBtn}
                  aria-label={t("chat.channelUserProfile.gif")}
                  title={t("chat.channelUserProfile.gif")}
                  onClick={handleGifMini}
                >
                  <IconSmile />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(
    <>
      {card}
      {renderMoreMenuPortal(moreOpen, miniMenuPos, moreMenuRef, {
        onViewFull: () => setView("full"),
        closeMore: () => setMoreOpen(false),
      })}
      {renderMoreMenuPortal(fullMoreOpen, fullMenuPos, fullMoreMenuRef, {
        closeMore: () => setFullMoreOpen(false),
      })}
    </>,
    document.body,
  );
}

