"use client";

import React, { useState, useEffect, useLayoutEffect, useRef, memo, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import styles from "./messages.module.css";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useLanguage, localeTagForLanguage } from "@/component/language-provider";
import {
  useDirectMessages,
  type DirectMessage,
} from "@/hooks/use-direct-messages";
import { useChannelMessages } from "@/hooks/use-channel-messages";
import * as serversApi from "@/lib/servers-api";
import { translateCategoryName, translateChannelName } from "@/lib/system-names";
import { DEFAULT_FREE_MAX_UPLOAD_BYTES } from "@/lib/upload-limits";
import { shouldPlayChannelMessageNotificationSound } from "@/lib/channel-notification-sound";
import { playMessageNotificationSound } from "@/lib/message-notification-sound";
import {
  sendDirectMessage,
  getDirectMessages,
  getConversationList,
  getAvailableUsers,
  fetchCurrentProfile,
  uploadMedia,
  uploadMediaBatch,
  type UploadMediaResponse,
  createPoll,
  getPollResults,
  votePoll,
  getMyVote,
  type Poll,
  type PollResults,
  fetchDeviceTrustStatus,
  verifyDeviceTrust,
  addMessageReaction,
  pinDirectMessage,
  reportDirectMessage,
  deleteDirectMessage,
  markDmConversationRead,
  fetchUserSettings,
  fetchBoostStatus,
  type BoostStatusResponse,
  fetchProfileDetail,
  type ProfileDetailResponse,
  type UserSettingsResponse,
  createStripeCheckoutSession,
  type CreateStripeCheckoutSessionRequest,
} from "@/lib/api";
import { getLiveKitToken, getDMRoomName, getVoiceChannelParticipants } from "@/lib/livekit-api";
import IncomingCallPopup from "@/components/IncomingCallPopup";
import OutgoingCallPopup from "@/components/OutgoingCallPopup";
import GiphyPicker, {
  type GiphyPickerSelection,
  type MediaPickerTab,
} from "@/components/GiphyPicker";
import VoiceRecorder from "@/components/VoiceRecorder";
import VoiceMessage from "@/components/VoiceMessage";
import ServerInviteCard from "@/components/ServerInviteCard/ServerInviteCard";
import { getGifById, getRandomWaveSticker, type GiphyGif } from "@/lib/giphy-api";
import QuickReactionBar from "@/components/QuickReactionBar";
import EmojiReactionPicker from "@/components/EmojiReactionPicker";
import MessageReactions from "@/components/MessageReactions";
import MessageActionsMenu from "@/components/MessageActionsMenu";
import ReportMessageDialog from "@/components/ReportMessageDialog";
import ReplyMessagePreview from "@/components/ReplyMessagePreview";
import DeleteMessageDialog from "@/components/DeleteMessageDialog";
import CreateServerModal from "@/components/CreateServerModal/CreateServerModal";
import CreateChannelModal, {
  type ChannelTypeForCreate,
} from "@/components/CreateChannelModal/CreateChannelModal";
import CreateCategoryModal from "@/components/CreateCategoryModal/CreateCategoryModal";
import EventsPopup from "@/components/ServerEvents/EventsPopup";
import CreateEventWizard from "@/components/ServerEvents/CreateEventWizard";
import EventImageEditor from "@/components/ServerEvents/EventImageEditor";
import ShareEventPopup from "@/components/ServerEvents/ShareEventPopup";
import EventCreatedDetailPopup from "@/components/ServerEvents/EventCreatedDetailPopup";
import InviteToServerPopup from "@/components/InviteToServerPopup/InviteToServerPopup";
import MessagesInbox from "@/components/MessagesInbox/MessagesInbox";
import ServerContextMenu from "@/components/ServerContextMenu/ServerContextMenu";
import ChannelContextMenu from "@/components/ChannelContextMenu/ChannelContextMenu";
import CategoryContextMenu from "@/components/CategoryContextMenu/CategoryContextMenu";
import * as sidebarPrefs from "@/lib/sidebar-prefs";
import type { CategoryNotifyMode, ChannelNotifyMode } from "@/lib/sidebar-prefs";
import ServerSettingsPanel, {
  type ServerSettingsSection,
} from "@/components/ServerSettingsPanel/ServerSettingsPanel";
import ServerMembersSection from "@/components/ServerMembersSection/ServerMembersSection";
import RolesSection from "@/components/RolesSection/RolesSection";
import ServerInteractionsSection from "@/components/ServerInteractionsSection/ServerInteractionsSection";
import ServerAccessSection from "@/components/ServerAccessSection/ServerAccessSection";
import ServerJoinApplicationsPanel from "@/components/ServerJoinApplicationsPanel/ServerJoinApplicationsPanel";
import type { ExploreServer } from "@/lib/servers-api";
import ApplyToJoinQuestionsModal from "@/components/ApplyToJoinQuestionsModal/ApplyToJoinQuestionsModal";
import ServerProfileSection from "@/components/ServerProfileSection/ServerProfileSection";
import CommunitySection from "@/components/CommunitySection/CommunitySection";
import AutoModSection from "@/components/AutoModSection/AutoModSection";
import ServerSafetySection from "@/components/ServerSafetySection/ServerSafetySection";
import { mapSectionToSafetyTab } from "@/components/ServerSafetySection/safety-tab-map";
import ServerBansSection from "@/components/ServerBansSection/ServerBansSection";
import ServerEmojiSection from "@/components/ServerEmojiSection/ServerEmojiSection";
import ServerStickerSection from "@/components/ServerStickerSection/ServerStickerSection";
import MessageSearchPanel from "@/components/MessageSearchPanel/MessageSearchPanel";
import MentionDropdown from "@/components/MentionDropdown/MentionDropdown";
import { fetchInboxForYou } from "@/lib/inbox-api";
import { normalizeServerBanner } from "@/lib/server-banner";
import type { VoiceChannelCallProps } from "@/components/VoiceChannelCall";
import ChannelUserProfileRoot, {
  type ChannelProfileAnchorContext,
} from "@/components/ChannelUserProfile/ChannelUserProfileRoot";
import MessagesUserSettingsModal from "@/components/MessagesUserSettings/MessagesUserSettingsModal";
import { applyAccentColor } from "@/component/theme-provider";
import {
  applyMessagesRootChromeFromStorage,
  migrateMessagesChromeStorageOnce,
} from "@/lib/messages-appearance-chrome";
import {
  getMessagesShellTheme,
  type MessagesShellTheme,
} from "@/lib/messages-shell-theme";
import { getDmSidebarPeersMode } from "@/lib/messages-dm-sidebar-prefs";
import UserProfilePopup from "@/components/UserProfilePopup/UserProfilePopup";

// Dynamic import CallRoom / VoiceChannelCall to avoid SSR issues with LiveKit
const CallRoom = dynamic(() => import("@/components/CallRoom"), { ssr: false });
const VoiceChannelCall = dynamic<VoiceChannelCallProps>(
  () => import("@/components/VoiceChannelCall"),
  { ssr: false },
);
const UNCATEGORIZED_CATEGORY_ID = "__uncategorized__";

function getDisplayNameTextStyle(
  source?: {
    displayNameFontId?: string | null;
    displayNameEffectId?: string | null;
    displayNamePrimaryHex?: string | null;
    displayNameAccentHex?: string | null;
  },
  messagesShellTheme: MessagesShellTheme = "dark",
): React.CSSProperties | undefined {
  if (!source) return undefined;
  const defaultPrimary = messagesShellTheme === "light" ? "#0F1629" : "#F2F3F5";
  const primary = /^#[0-9a-f]{6}$/i.test(String(source.displayNamePrimaryHex || ""))
    ? String(source.displayNamePrimaryHex)
    : defaultPrimary;
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
  return {
    color: primary,
    fontFamily,
  };
}

interface BackendServer extends serversApi.Server {
  infoChannels?: serversApi.Channel[];
  textChannels?: serversApi.Channel[];
  voiceChannels?: serversApi.Channel[];
  serverCategories?: serversApi.ServerCategory[];
}

interface MessageReaction {
  emoji: string; 
  userIds: string[]; 
  count: number; 
}

interface UIMessage {
  id: string;
  text: string;
  senderId: string;
  senderEmail: string;
  /** Display name lấy từ Profile.displayName (userDisplayName). */
  senderDisplayName?: string;
  senderName?: string;
  senderAvatar?: string;
  timestamp: Date;
  isFromCurrentUser: boolean;
  type: "server" | "direct"; // Thêm field để phân biệt loại chat
  isRead?: boolean; // Trạng thái đã đọc
  messageType?: "text" | "gif" | "sticker" | "voice" | "system" | "welcome";
  giphyId?: string;
  customStickerUrl?: string;
  serverStickerId?: string;
  voiceUrl?: string;
  voiceDuration?: number;
  reactions?: MessageReaction[];
  isPinned?: boolean;
  replyTo?: string;
  stickerReplyWelcomeEnabled?: boolean;
  contentModerationResult?: "none" | "blurred" | "rejected";
  replyToMessage?: {
    id: string;
    senderId?: string;
    senderDisplayName?: string;
    senderName?: string;
    messageType?: "text" | "gif" | "sticker" | "voice" | "system" | "welcome";
    text: string;
  } | null;
  /** Biệt danh trong máy chủ (nếu có) — mở card hồ sơ từ kênh. */
  serverNickname?: string;
  senderDisplayNameFontId?: string | null;
  senderDisplayNameEffectId?: string | null;
  senderDisplayNamePrimaryHex?: string | null;
  senderDisplayNameAccentHex?: string | null;
}

// GiphyMessage component for rendering GIF/Sticker
const GiphyMessage = memo(
  ({
    giphyId,
    messageType,
  }: {
    giphyId: string;
    messageType: "gif" | "sticker";
  }) => {
    const [gifData, setGifData] = useState<GiphyGif | null>(null);
    const [loading, setLoading] = useState(true);
    const { t } = useLanguage();

    useEffect(() => {
      getGifById(giphyId)
        .then((data) => {
          setGifData(data);
          setLoading(false);
        })
        .catch((err) => {
          console.error("Failed to load Giphy content:", err);
          setLoading(false);
        });
    }, [giphyId]);

    if (loading) {
      return (
        <div style={{ padding: "12px", color: "#b5bac1", fontSize: "14px" }}>
          {messageType === "gif"
            ? t("chat.loading.gif")
            : messageType === "sticker"
              ? t("chat.loading.sticker")
              : t("chat.loading.generic")}
        </div>
      );
    }

    if (!gifData) {
      return (
        <div style={{ fontSize: messageType === "sticker" ? 64 : 48, padding: "8px", lineHeight: 1 }}>
          👋
        </div>
      );
    }

    return (
      <img
        src={gifData.images.downsized.url}
        alt={gifData.title}
        style={{
          maxWidth: messageType === "sticker" ? "200px" : "300px",
          maxHeight: messageType === "sticker" ? "200px" : "300px",
          borderRadius: "8px",
          display: "block",
        }}
        loading="lazy"
      />
    );
  },
);

GiphyMessage.displayName = "GiphyMessage";

const PASSKEY_DEVICE_KEY = "cordigramDeviceId";

const getDeviceId = () => {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(PASSKEY_DEVICE_KEY);
  if (existing) return existing;
  const next =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(PASSKEY_DEVICE_KEY, next);
  return next;
};

// ✅ Move PollMessage component outside to prevent re-creation on every render
const PollMessage = memo(
  ({
    pollId,
    token,
    onError,
  }: {
    pollId: string;
    token: string;
    onError: (msg: string) => void;
  }) => {
    const [pollData, setPollData] = useState<PollResults | null>(null);
    const [selectedOptions, setSelectedOptions] = useState<number[]>([]);
    const [hasVoted, setHasVoted] = useState(false);
    const [showResults, setShowResults] = useState(false);

    const loadPoll = useCallback(async () => {
      try {
        const [results, myVote] = await Promise.all([
          getPollResults({ token, pollId }),
          getMyVote({ token, pollId }),
        ]);
        setPollData(results);
        if (myVote && myVote.length > 0) {
          setSelectedOptions(myVote);
          setHasVoted(true);
          setShowResults(true);
        }
      } catch (error) {
        console.error("Failed to load poll:", error);
      }
    }, [token, pollId]);

    useEffect(() => {
      loadPoll();
    }, [loadPoll]);

    const handleOptionToggle = useCallback(
      (index: number) => {
        if (hasVoted || !pollData) return;

        if (pollData.allowMultipleAnswers) {
          setSelectedOptions((prev) =>
            prev.includes(index)
              ? prev.filter((i) => i !== index)
              : [...prev, index],
          );
        } else {
          setSelectedOptions([index]);
        }
      },
      [hasVoted, pollData],
    );

    const handleVote = useCallback(async () => {
      if (!pollData || selectedOptions.length === 0) return;

      try {
        await votePoll({ token, pollId, optionIndexes: selectedOptions });
        setHasVoted(true);
        setShowResults(true);
        await loadPoll();
      } catch (error: any) {
        onError(error?.message || "Không gửi được bình chọn");
      }
    }, [pollData, selectedOptions, token, pollId, loadPoll, onError]);

    if (!pollData) {
      return <div className={styles.pollMessage}>Đang tải khảo sát...</div>;
    }

    return (
      <div className={styles.pollMessage}>
        <div className={styles.pollQuestion}>{pollData.question}</div>
        <div className={styles.pollSubtitle}>
          {pollData.allowMultipleAnswers
            ? "Chọn một hoặc nhiều phương án"
            : "Chọn một phương án"}
        </div>

        <div className={styles.pollOptions}>
          {pollData.options.map((option, index) => (
            <div key={index} className={styles.pollOptionItem}>
              {!showResults ? (
                <>
                  <input
                    type={pollData.allowMultipleAnswers ? "checkbox" : "radio"}
                    id={`poll-${pollId}-option-${index}`}
                    checked={selectedOptions.includes(index)}
                    onChange={() => handleOptionToggle(index)}
                    disabled={hasVoted}
                  />
                  <label htmlFor={`poll-${pollId}-option-${index}`}>
                    {option}
                  </label>
                </>
              ) : (
                <div className={styles.pollResultBar}>
                  <div className={styles.pollResultLabel}>
                    <span>{option}</span>
                    <span className={styles.pollResultPercentage}>
                      {pollData.results[index].percentage}%
                    </span>
                  </div>
                  <div className={styles.pollResultProgress}>
                    <div
                      className={styles.pollResultFill}
                      style={{
                        width: `${pollData.results[index].percentage}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className={styles.pollFooter}>
          <span className={styles.pollStats}>
            {pollData.uniqueVoters} votes • {pollData.hoursLeft} hours left
          </span>
          <div className={styles.pollActions}>
            {!showResults && (
              <button
                className={styles.pollActionButton}
                onClick={() => setShowResults(true)}
              >
                Show results
              </button>
            )}
            {!hasVoted && !showResults && (
              <button
                className={`${styles.pollActionButton} ${styles.pollVoteButton}`}
                onClick={handleVote}
                disabled={selectedOptions.length === 0}
              >
                Vote
              </button>
            )}
            {hasVoted && <span className={styles.pollVoted}>✓ Voted</span>}
          </div>
        </div>
      </div>
    );
  },
);

PollMessage.displayName = "PollMessage";

function BlurredImage({ blurredUrl, canReveal, className, onError }: {
  blurredUrl: string;
  canReveal: boolean;
  className?: string;
  onError?: React.ReactEventHandler<HTMLImageElement>;
}) {
  const [revealed, setRevealed] = useState(false);
  const displayUrl = revealed ? blurredUrl.replace(/e_blur:\d+\//, "") : blurredUrl;

  return (
    <div style={{ position: "relative" }}>
      <img src={displayUrl} alt="Ảnh được chia sẻ" className={className} onError={onError} />
      {!revealed && (
        <>
          {canReveal && (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              style={{
                position: "absolute", top: "50%", left: "50%",
                transform: "translate(-50%, -50%)",
                background: "rgba(0,0,0,0.75)", border: "none",
                borderRadius: 8, padding: "10px 20px",
                color: "#fff", fontSize: 14, fontWeight: 600,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                backdropFilter: "blur(4px)", transition: "background 0.15s",
                zIndex: 2,
              }}
              onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.9)"; }}
              onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.75)"; }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              Xem hình ảnh
            </button>
          )}
          <div style={{
            position: "absolute", bottom: 8, left: 8, right: 8,
            background: "rgba(0,0,0,0.7)", borderRadius: 4,
            padding: "4px 8px", fontSize: 11, color: "#faa61a",
            display: "flex", alignItems: "center", gap: 4, zIndex: 1,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
            Nội dung nhạy cảm đã bị làm mờ
          </div>
        </>
      )}
    </div>
  );
}

// Custom comparison function for memo - only re-render if message content or read status changed
function areMessagesEqual(
  prevProps: {
    message: UIMessage;
    renderMessageContent: (message: UIMessage) => React.ReactNode;
    onVisible?: (messageId: string, isVisible: boolean) => void;
    senderColor?: string;
    senderNameStyle?: React.CSSProperties;
    onChannelUserProfileOpen?: (
      message: UIMessage,
      anchorRect: DOMRect,
    ) => void;
  },
  nextProps: {
    message: UIMessage;
    renderMessageContent: (message: UIMessage) => React.ReactNode;
    onVisible?: (messageId: string, isVisible: boolean) => void;
    senderColor?: string;
    senderNameStyle?: React.CSSProperties;
    onChannelUserProfileOpen?: (
      message: UIMessage,
      anchorRect: DOMRect,
    ) => void;
  },
) {
  if (prevProps.senderColor !== nextProps.senderColor) return false;
  if (prevProps.senderNameStyle !== nextProps.senderNameStyle) return false;
  if (prevProps.onChannelUserProfileOpen !== nextProps.onChannelUserProfileOpen)
    return false;
  if (prevProps.message.id !== nextProps.message.id) return false;

  // Re-render if read status changed (THIS IS KEY!)
  if (prevProps.message.isRead !== nextProps.message.isRead) {
    console.log(
      "🔄 Message read status changed, re-rendering:",
      nextProps.message.id,
      "isRead:",
      nextProps.message.isRead,
    );
    return false;
  }

  // Re-render if text content changed
  if (prevProps.message.text !== nextProps.message.text) return false;

  // Re-render if messageType or giphyId changed
  if (prevProps.message.messageType !== nextProps.message.messageType)
    return false;
  if (prevProps.message.giphyId !== nextProps.message.giphyId) return false;
  if (prevProps.message.customStickerUrl !== nextProps.message.customStickerUrl)
    return false;
  if (prevProps.message.voiceUrl !== nextProps.message.voiceUrl) return false;
  if (prevProps.message.voiceDuration !== nextProps.message.voiceDuration)
    return false;

  // ✅ Re-render if reactions changed (otherwise UI requires reload)
  if (prevProps.message.reactions !== nextProps.message.reactions) return false;
  if (prevProps.message.replyTo !== nextProps.message.replyTo) return false;
  if (prevProps.message.replyToMessage !== nextProps.message.replyToMessage)
    return false;

  // Emoji map / jumbo sizing đi qua renderMessageContent — phải re-render khi callback đổi
  if (prevProps.renderMessageContent !== nextProps.renderMessageContent)
    return false;

  // Don't re-render if only timestamp changed
  return true;
}

// ✅ Memoized MessageItem component with Intersection Observer for read receipts
const MessageItem = memo(
  ({
    message,
    renderMessageContent,
    onVisible,
    currentUserId,
    onReaction,
    onReply,
    onPin,
    onReport,
    onDelete,
    scrollContainerRef,
    dmPartnerDisplayName,
    senderColor,
    senderNameStyle,
    onChannelUserProfileOpen,
  }: {
    message: UIMessage;
    renderMessageContent: (message: UIMessage) => React.ReactNode;
    onVisible?: (messageId: string, isVisible: boolean) => void;
    currentUserId?: string;
    onReaction?: (messageId: string, emoji: string) => void;
    onReply?: (message: UIMessage) => void;
    onPin?: (messageId: string) => void;
    onReport?: (messageId: string) => void;
    onDelete?: (messageId: string) => void;
    scrollContainerRef?: React.RefObject<HTMLElement | null>;
    dmPartnerDisplayName?: string;
    senderColor?: string; // Màu hiển thị từ role cao nhất
    senderNameStyle?: React.CSSProperties;
    onChannelUserProfileOpen?: (
      message: UIMessage,
      anchorRect: DOMRect,
    ) => void;
  }) => {
    const { t } = useLanguage();
    const messageRef = useRef<HTMLDivElement>(null);
    const [isHovered, setIsHovered] = useState(false);
    const [showQuickReactions, setShowQuickReactions] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showActionsMenu, setShowActionsMenu] = useState(false);
    const [fixedReactionPosition, setFixedReactionPosition] = useState<{
      top: number;
      left: number;
    } | null>(null);

    const updateFixedPosition = useCallback(() => {
      const el = messageRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const fromRight = message.isFromCurrentUser && message.replyToMessage?.messageType !== "welcome";
      const PADDING = 8;
      const QUICK_BAR_W = 380; // estimate to keep inside viewport
      const baseLeft = fromRight ? rect.right - QUICK_BAR_W - 10 : rect.left + 50;
      const clampedLeft = Math.min(
        Math.max(baseLeft, PADDING),
        Math.max(PADDING, window.innerWidth - PADDING - QUICK_BAR_W),
      );

      setFixedReactionPosition({
        top: rect.top - 50,
        left: clampedLeft,
      });
    }, [message.isFromCurrentUser, message.replyToMessage?.messageType]);

    useLayoutEffect(() => {
      if (!scrollContainerRef?.current || (!isHovered && !showEmojiPicker && !showActionsMenu)) {
        setFixedReactionPosition(null);
        return;
      }
      updateFixedPosition();
      const container = scrollContainerRef.current;
      const onScroll = () => updateFixedPosition();
      container.addEventListener("scroll", onScroll, { passive: true });
      return () => container.removeEventListener("scroll", onScroll);
    }, [scrollContainerRef, isHovered, showEmojiPicker, showActionsMenu, updateFixedPosition]);

    // ✅ Setup Intersection Observer to detect when message is visible
    useEffect(() => {
      if (
        !messageRef.current ||
        !onVisible ||
        message.isFromCurrentUser ||
        message.isRead
      ) {
        return;
      }

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            // Message is considered visible if at least 50% of it is in viewport
            const isVisible =
              entry.isIntersecting && entry.intersectionRatio >= 0.5;
            if (isVisible) {
              console.log("📍 Message entered viewport (50%+):", message.id);
            }
            onVisible(message.id, isVisible);
          });
        },
        {
          threshold: [0, 0.5, 1], // Trigger at 0%, 50%, and 100% visibility
          rootMargin: "0px",
        },
      );

      observer.observe(messageRef.current);

      return () => {
        observer.disconnect();
      };
    }, [message.id, message.isFromCurrentUser, message.isRead, onVisible]);

    /** Sticker/GIF trả lời welcome: hiển thị căn trái như tin nhận (không dùng bubble gửi bên phải). */
    const alignAsSent =
      message.isFromCurrentUser &&
      message.replyToMessage?.messageType !== "welcome";

    return (
      <div
        ref={messageRef}
        className={`${styles.messageGroup} ${
          alignAsSent ? styles.sent : styles.received
        }`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setShowQuickReactions(false);
        }}
        style={{ position: "relative" }}
      >
        {/* Avatar — kênh server: bấm mở card hồ sơ (không phải tin của mình). */}
        {onChannelUserProfileOpen &&
        !message.isFromCurrentUser &&
        message.type === "server" ? (
          <button
            type="button"
            className={`${styles.messageAvatar} ${styles.messageAvatarButton}`}
            aria-label="Xem hồ sơ người gửi"
            onClick={(e) => {
              e.stopPropagation();
              const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
              onChannelUserProfileOpen(message, r);
            }}
          >
            {isValidAvatarUrl(message.senderAvatar) ? (
              <img
                src={message.senderAvatar}
                alt={message.senderName || "Người dùng"}
              />
            ) : (
              <div className={styles.avatarPlaceholder}>
                {(message.senderName || message.senderEmail || "?")
                  .charAt(0)
                  .toUpperCase()}
              </div>
            )}
          </button>
        ) : (
          <div className={styles.messageAvatar}>
            {isValidAvatarUrl(message.senderAvatar) ? (
              <img
                src={message.senderAvatar}
                alt={message.senderName || "Người dùng"}
              />
            ) : (
              <div className={styles.avatarPlaceholder}>
                {(message.senderName || message.senderEmail || "?")
                  .charAt(0)
                  .toUpperCase()}
              </div>
            )}
          </div>
        )}

        <div className={styles.messageContent}>
          {/* Name and timestamp */}
          <div className={styles.messageHeader}>
            <span 
              className={styles.messageSenderName}
              style={
                senderNameStyle
                  ? senderNameStyle
                  : senderColor
                    ? { color: senderColor }
                    : undefined
              }
            >
              {message.senderDisplayName ||
                message.senderName ||
                message.senderEmail ||
                "Unknown"}
            </span>
            <span className={styles.messageTime}>
              {formatMessageTime(message.timestamp)}
            </span>
          </div>

          {/* Message bubble */}
          {message.replyToMessage && (
            <div className={styles.replyContext}>
              <div className={styles.replyContextLine} />
              <div className={styles.replyContextContent}>
                <div className={styles.replyContextLabel}>
                  {(() => {
                    const replierName = message.isFromCurrentUser
                      ? "Bạn"
                      : message.senderDisplayName ||
                        message.senderName ||
                        message.senderEmail ||
                        "Người dùng";

                    // Case 1: A tự trả lời tin nhắn của A
                    if (
                      message.replyToMessage.senderId &&
                      message.replyToMessage.senderId === message.senderId
                    ) {
                      return `${replierName} đã trả lời chính mình`;
                    }

                    // Case 2: A trả lời tin nhắn của B (người đang xem là B) → "A đã trả lời tin nhắn của bạn"
                    if (
                      message.replyToMessage.senderId &&
                      message.replyToMessage.senderId === currentUserId
                    ) {
                      return `${replierName} đã trả lời tin nhắn của bạn`;
                    }

                    // Fallback: trả lời tin nhắn của người khác (hiếm trong DM)
                    return `${replierName} đã trả lời ${
                      message.replyToMessage.senderDisplayName ||
                      message.replyToMessage.senderName ||
                      dmPartnerDisplayName ||
                      "người dùng"
                    }`;
                  })()}
                </div>
                <div className={styles.replyContextText}>
                  {message.replyToMessage.messageType === "gif"
                    ? t("chat.composer.replyGif")
                    : message.replyToMessage.messageType === "sticker"
                      ? t("chat.composer.replySticker")
                      : message.replyToMessage.messageType === "voice"
                        ? t("chat.composer.replyVoice")
                        : message.replyToMessage.messageType === "welcome"
                          ? (message.replyToMessage.text || t("chat.composer.replyWelcomeFallback"))
                        : message.replyToMessage.text}
                </div>
              </div>
            </div>
          )}
          <div
            className={`${styles.messageBubble} ${
              alignAsSent ? styles.sent : styles.received
            }`}
          >
            {renderMessageContent(message)}
          </div>

          {/* Message Reactions (ẩn khi đang hiện ở thanh sticky phía trên) */}
          {message.reactions && message.reactions.length > 0 && (
            <MessageReactions
              reactions={message.reactions}
              currentUserId={currentUserId || ""}
              onReactionClick={(emoji) => onReaction?.(message.id, emoji)}
              onAddClick={() => setShowEmojiPicker(true)}
            />
          )}

          {/* ✅ Read receipt indicator - only show for sent messages */}
          {alignAsSent && message.type === "direct" && (
            <div className={styles.readReceipt}>
              {message.isRead ? (
                <div className={styles.readStatus}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    className={styles.readIcon}
                  >
                    {/* Double checkmark for read */}
                    <path
                      d="M2 8.5L5.5 12L14 3.5"
                      stroke="#4a9eff"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M5 8.5L8.5 12L14 6.5"
                      stroke="#4a9eff"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.6"
                    />
                  </svg>
                  <span className={styles.readText}>{t("chat.dmList.seen")}</span>
                </div>
              ) : (
                <div className={styles.readStatus}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    className={styles.unreadIcon}
                  >
                    {/* Single checkmark for sent but not read */}
                    <path
                      d="M2 8.5L5.5 12L14 3.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.5"
                    />
                  </svg>
                  <span className={styles.unreadText}>{t("chat.dmList.sent")}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Reaction Bar on Hover — portal với position:fixed + z-index cao để đè lên chatHeader khi cần */}
        {isHovered && (scrollContainerRef && fixedReactionPosition ? (
          createPortal(
            <div
              style={{
                position: "fixed",
                zIndex: 10005,
                top: fixedReactionPosition.top,
                left: fixedReactionPosition.left,
              }}
            >
              <QuickReactionBar
                onReactionSelect={(emoji) => onReaction?.(message.id, emoji)}
                onMoreClick={() => setShowEmojiPicker(true)}
                onReplyClick={() => onReply?.(message)}
                onMenuClick={() => setShowActionsMenu(true)}
              />
            </div>,
            document.body,
          )
        ) : (
          <QuickReactionBar
            onReactionSelect={(emoji) => onReaction?.(message.id, emoji)}
            onMoreClick={() => setShowEmojiPicker(true)}
            onReplyClick={() => onReply?.(message)}
            onMenuClick={() => setShowActionsMenu(true)}
            position={{
              top: -45,
              right: alignAsSent ? 10 : undefined,
              left: alignAsSent ? undefined : 50,
            }}
          />
        ))}

        {/* Emoji Reaction Picker — portal để đè lên chatHeader */}
        {showEmojiPicker && (scrollContainerRef && fixedReactionPosition ? (
          createPortal(
            <div
              style={{
                position: "fixed",
                zIndex: 10006,
                top: fixedReactionPosition.top + 50,
                // Emoji picker width is fixed (340px), clamp by shifting left if needed
                left: Math.min(
                  fixedReactionPosition.left,
                  Math.max(8, window.innerWidth - 8 - 340),
                ),
              }}
            >
              <EmojiReactionPicker
                onSelect={(emoji) => {
                  onReaction?.(message.id, emoji);
                  setShowEmojiPicker(false);
                }}
                onClose={() => setShowEmojiPicker(false)}
              />
            </div>,
            document.body,
          )
        ) : (
          <EmojiReactionPicker
            onSelect={(emoji) => {
              onReaction?.(message.id, emoji);
              setShowEmojiPicker(false);
            }}
            onClose={() => setShowEmojiPicker(false)}
            position={{
              top: 50,
              right: alignAsSent ? 10 : undefined,
              left: alignAsSent ? undefined : 50,
            }}
          />
        ))}

        {/* Message Actions Menu */}
        {showActionsMenu && (
          <MessageActionsMenu
            onRemove={
              message.isFromCurrentUser
                ? () => {
                    onDelete?.(message.id);
                  }
                : undefined
            }
            onPin={() => {
              onPin?.(message.id);
              setShowActionsMenu(false);
            }}
            onReport={
              !message.isFromCurrentUser
                ? () => {
                    onReport?.(message.id);
                    setShowActionsMenu(false);
                  }
                : undefined
            }
            onClose={() => setShowActionsMenu(false)}
            position={{
              top: 50,
              right: alignAsSent ? 10 : undefined,
              left: alignAsSent ? undefined : 50,
            }}
            isOwnMessage={message.isFromCurrentUser}
            isPinned={message.isPinned || false}
          />
        )}
      </div>
    );
  },
  areMessagesEqual,
); // ✅ Use custom comparison

MessageItem.displayName = "MessageItem";

// ✅ Extracted formatTime to avoid re-creating on every render
function formatMessageTime(date: Date) {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

/** Kích thước emoji :name: trong dòng chữ (kênh + DM). */
const CUSTOM_EMOJI_INLINE_PX = 22;
/** Emoji “jumbo” khi tin chỉ có emoji máy chủ (giống Discord). */
const CUSTOM_EMOJI_JUMBO_PX = 48;
const CUSTOM_EMOJI_JUMBO_MAX_COUNT = 3;

/**
 * Nếu toàn bộ tin (bỏ khoảng trắng) chỉ gồm 1–3 token :ten: và mỗi token đều có trong map → trả về kích thước jumbo.
 */
function getServerCustomEmojiRenderSizePx(
  text: string,
  map: Record<string, string>,
): number {
  const trimmed = text.trim();
  if (!trimmed) return CUSTOM_EMOJI_INLINE_PX;
  const stripped = trimmed.replace(/\s+/g, "");
  if (!stripped.length) return CUSTOM_EMOJI_INLINE_PX;
  if (!/^(:[a-zA-Z0-9_]{1,80}:)+$/.test(stripped)) return CUSTOM_EMOJI_INLINE_PX;
  const tokens = stripped.match(/:[a-zA-Z0-9_]{1,80}:/g) ?? [];
  if (
    tokens.length === 0 ||
    tokens.length > CUSTOM_EMOJI_JUMBO_MAX_COUNT
  ) {
    return CUSTOM_EMOJI_INLINE_PX;
  }
  const allResolved = tokens.every((t) => {
    const name = t.slice(1, -1).toLowerCase();
    return Boolean(map[name]);
  });
  return allResolved ? CUSTOM_EMOJI_JUMBO_PX : CUSTOM_EMOJI_INLINE_PX;
}

/** API getMessages sort createdAt:-1; UI chat cần cũ → mới (trên xuống dưới) để khớp append/socket. */
function sortServerMessagesAscending(messages: UIMessage[]): UIMessage[] {
  return [...messages].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );
}

function appendServerMessage(prev: UIMessage[], ui: UIMessage): UIMessage[] {
  if (prev.some((m) => m.id === ui.id)) return prev;
  return sortServerMessagesAscending([...prev, ui]);
}

// ✅ Helper function to check if avatar URL is valid
function isValidAvatarUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.startsWith("http://") || url.startsWith("https://");
}

function normalizeReactions(
  raw:
    | Array<{ userId: any; emoji: string }>
    | Array<{ userIds: string[]; emoji: string; count: number }>
    | undefined
    | null,
): MessageReaction[] | undefined {
  if (!raw || raw.length === 0) return undefined;

  const first: any = raw[0];
  // Already UI format
  if (first && Array.isArray(first.userIds) && typeof first.count === "number") {
    return raw as any;
  }

  // Backend format: [{ userId, emoji }]
  const map = new Map<string, Set<string>>();
  for (const r of raw as any[]) {
    const emoji = r.emoji;
    const userId =
      typeof r.userId === "string"
        ? r.userId
        : r.userId?._id?.toString?.() || r.userId?.toString?.();
    if (!emoji || !userId) continue;
    const set = map.get(emoji) || new Set<string>();
    set.add(userId);
    map.set(emoji, set);
  }

  return Array.from(map.entries()).map(([emoji, set]) => ({
    emoji,
    userIds: Array.from(set),
    count: set.size,
  }));
}

function mapReplyToMessage(raw: any): UIMessage["replyToMessage"] {
  if (!raw || !raw._id) return null;
  const sender = raw.senderId;
  return {
    id: raw._id,
    senderId: typeof sender === "string" ? sender : sender?._id,
    senderDisplayName:
      typeof sender === "object" ? sender?.displayName || undefined : undefined,
    senderName: typeof sender === "object" ? sender?.username || "" : "",
    messageType: raw.type || "text",
    text: raw.content || "",
  };
}

export default function MessagesPage() {
  const searchParams = useSearchParams();
  const { t, language } = useLanguage();

  const isAdminView = searchParams.get("from") === "admin";
  const adminReturnUrl = searchParams.get("returnUrl");
  const adminViewServerId = isAdminView ? searchParams.get("server") : null;
  const adminTokenFromUrl = isAdminView ? searchParams.get("adminToken") : null;

  // Skip login redirect entirely for admin view
  const canRender = useRequireAuth({ skip: isAdminView });

  const [messagesShellTheme, setMessagesShellTheme] = useState<MessagesShellTheme>("dark");

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    setMessagesShellTheme(getMessagesShellTheme());
  }, []);

  useEffect(() => {
    const fn = () => setMessagesShellTheme(getMessagesShellTheme());
    window.addEventListener("cordigram-messages-shell-theme", fn);
    return () => window.removeEventListener("cordigram-messages-shell-theme", fn);
  }, []);

  const [servers, setServers] = useState<BackendServer[]>([]);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const serversRef = useRef(servers);
  serversRef.current = servers;
  const selectedServerRef = useRef(selectedServer);
  selectedServerRef.current = selectedServer;
  const [infoChannels, setInfoChannels] = useState<serversApi.Channel[]>([]);
  const [textChannels, setTextChannels] = useState<serversApi.Channel[]>([]);
  const [voiceChannels, setVoiceChannels] = useState<serversApi.Channel[]>([]);
  const [serverCategories, setServerCategories] = useState<serversApi.ServerCategory[]>([]);
  const [allChannels, setAllChannels] = useState<serversApi.Channel[]>([]);
  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);

  // Permission: can this user reorder channels/categories?
  const [canDragChannels, setCanDragChannels] = useState(false);
  /** Quyền dùng @ (mentionEveryone / owner) — không ảnh hưởng xem tin khi người khác đề cập bạn. */
  const [canUseMentions, setCanUseMentions] = useState(false);

  // Drag-and-drop state
  const [dragType, setDragType] = useState<"category" | "channel" | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<"before" | "after" | "inside">("after");
  const [serverInteractionSettings, setServerInteractionSettings] = useState<serversApi.ServerInteractionSettings | null>(null);
  // Map userId -> displayColor (màu role cao nhất) cho server hiện tại
  const [memberRoleColors, setMemberRoleColors] = useState<Record<string, string>>({});
  /** Thành viên đủ username/displayName (getServerMembersWithRoles) cho gợi ý `from:` trong tìm tin nhắn server */
  const [membersForMessageSearch, setMembersForMessageSearch] = useState<
    Array<{ userId: string; displayName?: string; username?: string; avatarUrl?: string }>
  >([]);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateServerModal, setShowCreateServerModal] = useState(false);
  const [serverName, setServerName] = useState("");
  const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);
  const [createChannelDefaultType, setCreateChannelDefaultType] =
    useState<ChannelTypeForCreate>("text");
  const [createChannelSectionLabel, setCreateChannelSectionLabel] = useState<string>("Kênh Chat");
  const [createChannelCategoryId, setCreateChannelCategoryId] = useState<string | undefined>(undefined);
  const [serverContextMenu, setServerContextMenu] = useState<{
    x: number;
    y: number;
    server: BackendServer;
    permissions?: serversApi.CurrentUserServerPermissions;
  } | null>(null);
  const [adminServerContextMenu, setAdminServerContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [channelContextMenu, setChannelContextMenu] = useState<{
    x: number;
    y: number;
    channel: { _id: string; name: string; isDefault?: boolean };
    categoryId: string | null;
  } | null>(null);
  const [categoryContextMenu, setCategoryContextMenu] = useState<{
    x: number;
    y: number;
    category: { _id: string; name: string };
  } | null>(null);
  const [renamingCategoryId, setRenamingCategoryId] = useState<string | null>(null);
  const [renamingCategoryName, setRenamingCategoryName] = useState("");
  const renameCancelledRef = useRef(false);
  const [serverSettingsPermissions, setServerSettingsPermissions] =
    useState<serversApi.CurrentUserServerPermissions | null>(null);
  const [showServerSettingsPanel, setShowServerSettingsPanel] = useState(false);
  const [serverSettingsTarget, setServerSettingsTarget] = useState<{
    serverId: string;
    serverName: string;
    initialSection?: ServerSettingsSection;
  } | null>(null);
  const serverSettingsTargetRef = useRef(serverSettingsTarget);
  serverSettingsTargetRef.current = serverSettingsTarget;
  const [communityEnabled, setCommunityEnabled] = useState(false);
  const [showAllChannels, setShowAllChannels] = useState(false);
  const [serverNotificationLevel, setServerNotificationLevel] = useState<"all" | "mentions" | "none">("all");
  /** Tên vai trò (không phải default) để áp dụng «Bỏ vai trò @mention» khi phát âm thanh tin nhắn kênh. */
  const [notificationRoleNames, setNotificationRoleNames] = useState<string[]>([]);
  const [currentServerPermissions, setCurrentServerPermissions] =
    useState<serversApi.CurrentUserServerPermissions | null>(null);
  const [sidebarPrefsTick, setSidebarPrefsTick] = useState(0);
  const bumpSidebarPrefs = useCallback(() => setSidebarPrefsTick((t) => t + 1), []);
  const [wavingIds, setWavingIds] = useState<Set<string>>(new Set());

  // Mention system
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionKeyword, setMentionKeyword] = useState("");
  const [mentionSuggestions, setMentionSuggestions] = useState<serversApi.MentionSuggestion[]>([]);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(-1);
  const mentionFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const [showEventsPopup, setShowEventsPopup] = useState(false);
  const [showCreateEventWizard, setShowCreateEventWizard] = useState(false);
  const [showEventImageEditor, setShowEventImageEditor] = useState(false);
  const [eventImageEditorCurrentUrl, setEventImageEditorCurrentUrl] = useState<string | null>(null);
  const eventImageEditorResolveRef = useRef<((url: string | null) => void) | null>(null);
  const [shareEventLink, setShareEventLink] = useState<string>("");
  const [showShareEventPopup, setShowShareEventPopup] = useState(false);
  const [showMessagesInbox, setShowMessagesInbox] = useState(false);
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  /** true = popup tìm tin từ header DM: chỉ nội dung, không @/#/!/*. */
  const [messageSearchDmConversationOnly, setMessageSearchDmConversationOnly] = useState(false);
  /** Có lời mời hoặc nội dung mới trong Hộp thư (Dành cho Bạn) → hiển thị chấm đỏ trên nút hộp thư. */
  const [hasInboxNotification, setHasInboxNotification] = useState(false);
  const [createdEventDetail, setCreatedEventDetail] = useState<serversApi.ServerEvent | null>(null);
  const [activeServerEvents, setActiveServerEvents] = useState<serversApi.ServerEvent[]>([]);
  /** Tổng số sự kiện (active + upcoming) để hiển thị badge bên cạnh "Sự Kiện", không giảm khi user đóng banner Đang Diễn Ra */
  const [serverEventsTotalCount, setServerEventsTotalCount] = useState(0);
  const [showJoinApplicationsView, setShowJoinApplicationsView] = useState(false);
  const [showExploreView, setShowExploreView] = useState(false);
  const [showBoostUpgradeView, setShowBoostUpgradeView] = useState(false);
  const [joinApplicationsRefreshTick, setJoinApplicationsRefreshTick] = useState(0);
  const [joinAppPendingCount, setJoinAppPendingCount] = useState(0);
  const [selectedEventDetail, setSelectedEventDetail] = useState<serversApi.ServerEvent | null>(null);
  const [eventDetailInterested, setEventDetailInterested] = useState(false);

  const [boostModalOpen, setBoostModalOpen] = useState(false);
  const [boostModalStep, setBoostModalStep] = useState<"plan" | "billing">("plan");
  const [boostMode, setBoostMode] = useState<"subscribe" | "gift">("subscribe");
  const [boostTier, setBoostTier] = useState<"basic" | "boost">("boost");
  const [boostBillingCycle, setBoostBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [boostRecipientUserId, setBoostRecipientUserId] = useState<string | null>(null);
  const [boostUserQuery, setBoostUserQuery] = useState("");
  const [boostUsers, setBoostUsers] = useState<any[]>([]);
  const [boostActivePeriodWarnOpen, setBoostActivePeriodWarnOpen] =
    useState(false);
  const [boostTierSwitchWarnOpen, setBoostTierSwitchWarnOpen] =
    useState(false);
  const [boostCheckoutBusy, setBoostCheckoutBusy] = useState(false);

  useEffect(() => {
    if (selectedEventDetail) setEventDetailInterested(false);
  }, [selectedEventDetail?._id]);

  useEffect(() => {
    if (!boostModalOpen) return;
    if (boostMode !== "gift") return;
    getAvailableUsers()
      .then((res) => setBoostUsers(Array.isArray(res) ? res : []))
      .catch(() => setBoostUsers([]));
  }, [boostModalOpen, boostMode]);

  useEffect(() => {
    if (!boostModalOpen) {
      setBoostActivePeriodWarnOpen(false);
      setBoostTierSwitchWarnOpen(false);
      setBoostCheckoutBusy(false);
    }
  }, [boostModalOpen]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const processedCallsRef = useRef<Set<string>>(new Set());
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [friends, setFriends] = useState<serversApi.Friend[]>([]);
  const [selectedDirectMessageFriend, setSelectedDirectMessageFriend] =
    useState<serversApi.Friend | null>(null);
  // Access Control (server rules approval modal)
  const [myServerAccessStatus, setMyServerAccessStatus] =
    useState<serversApi.MyServerAccessStatus | null>(null);
  const [showAcceptRulesModal, setShowAcceptRulesModal] = useState(false);
  const [acceptRulesLoading, setAcceptRulesLoading] = useState(false);
  const [verificationRulesOpen, setVerificationRulesOpen] = useState(false);
  const [verificationAccessSettings, setVerificationAccessSettings] =
    useState<serversApi.ServerAccessSettings | null>(null);
  const [verificationRulesAgreed, setVerificationRulesAgreed] = useState(false);
  const [verificationRulesSubmitting, setVerificationRulesSubmitting] = useState(false);
  const [ageAcknowledgeLoading, setAgeAcknowledgeLoading] = useState(false);
  const isAgeRestrictedRef = useRef(false);
  const [localWaitAccountSec, setLocalWaitAccountSec] = useState<number | null>(null);
  const [localWaitMemberSec, setLocalWaitMemberSec] = useState<number | null>(null);
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpCode, setEmailOtpCode] = useState("");
  const [emailOtpSending, setEmailOtpSending] = useState(false);
  const [emailOtpVerifying, setEmailOtpVerifying] = useState(false);
  const [emailOtpError, setEmailOtpError] = useState<string | null>(null);
  const [emailOtpCooldown, setEmailOtpCooldown] = useState(0);
  const [dmProfileSidebarOpen, setDmProfileSidebarOpen] = useState(true);
  const [dmProfilePopupUserId, setDmProfilePopupUserId] = useState<string | null>(null);
  const [dmProfileDetail, setDmProfileDetail] = useState<ProfileDetailResponse | null>(null);
  const [inviteToServerTarget, setInviteToServerTarget] = useState<{
    serverId: string;
    serverName: string;
  } | null>(null);
  const [inviteToServerCandidates, setInviteToServerCandidates] = useState<serversApi.Friend[]>([]);
  const [voiceChannelCallToken, setVoiceChannelCallToken] = useState<string | null>(null);
  const [voiceChannelCallServerUrl, setVoiceChannelCallServerUrl] = useState<string>("");
  const [voiceChannelCallError, setVoiceChannelCallError] = useState<string | null>(null);
  const [voiceChannelParticipants, setVoiceChannelParticipants] = useState<
    Record<string, { identity: string; name: string }[]>
  >({});
  const [conversations, setConversations] = useState<Map<string, UIMessage[]>>(
    new Map(),
  );
  /** Unread count per DM conversation (userId -> count). Updated from getConversationList; cleared when user opens chat. */
  const [dmUnreadCounts, setDmUnreadCounts] = useState<Record<string, number>>({});
  const [loadingDirectMessages, setLoadingDirectMessages] = useState(false);
  const [token, setToken] = useState<string>("");
  const [showMessagesUserSettings, setShowMessagesUserSettings] =
    useState(false);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [chatUserSettings, setChatUserSettings] =
    useState<UserSettingsResponse | null>(null);
  const [maxUploadBytes, setMaxUploadBytes] = useState<number>(
    DEFAULT_FREE_MAX_UPLOAD_BYTES,
  );
  const [boostStatus, setBoostStatus] = useState<BoostStatusResponse | null>(null);

  const submitMessagesBoostCheckout = useCallback(
    async (opts?: { skipTierChangeConfirm?: boolean }) => {
      if (
        !opts?.skipTierChangeConfirm &&
        boostMode === "subscribe" &&
        boostStatus?.active &&
        boostStatus.tier &&
        boostTier !== boostStatus.tier
      ) {
        setBoostTierSwitchWarnOpen(true);
        return;
      }
      if (!token) {
        alert("Bạn cần đăng nhập để thanh toán.");
        return;
      }
      try {
        setBoostCheckoutBusy(true);
        const actionType =
          boostMode === "gift" ? "boost_gift" : "boost_subscribe";
        const payload: CreateStripeCheckoutSessionRequest = {
          actionType,
          boostTier,
          billingCycle: boostBillingCycle,
          currency: "vnd",
        };
        if (boostMode === "gift" && boostRecipientUserId) {
          payload.recipientUserId = boostRecipientUserId;
        }
        const session = await createStripeCheckoutSession({
          token,
          payload,
        });
        if (session?.url) {
          window.location.href = session.url;
          return;
        }
        alert("Không thể mở trang thanh toán.");
      } catch (e: unknown) {
        const err = e as { message?: string };
        alert(err?.message || "Thanh toán thất bại.");
      } finally {
        setBoostCheckoutBusy(false);
      }
    },
    [
      token,
      boostMode,
      boostTier,
      boostBillingCycle,
      boostRecipientUserId,
      boostStatus,
    ],
  );

  const goToBoostBillingStep = useCallback(() => {
    if (
      boostMode === "subscribe" &&
      boostStatus?.active &&
      boostStatus.expiresAt
    ) {
      setBoostActivePeriodWarnOpen(true);
      return;
    }
    setBoostModalStep("billing");
  }, [boostMode, boostStatus]);

  const [dmSidebarPeersModeState, setDmSidebarPeersModeState] = useState<
    "all" | "online"
  >(() =>
    typeof window !== "undefined" ? getDmSidebarPeersMode() : "all",
  );
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const resolveMessageSenderStyle = useCallback(
    (message: UIMessage): React.CSSProperties | undefined => {
      const directFriend =
        selectedDirectMessageFriend &&
        String(selectedDirectMessageFriend._id) === String(message.senderId)
          ? selectedDirectMessageFriend
          : null;
      const directProfile =
        dmProfileDetail &&
        String(dmProfileDetail.userId) === String(message.senderId)
          ? dmProfileDetail
          : null;
      const sidebarFriend = friends.find((f) => String(f._id) === String(message.senderId));
      const source =
        (message.isFromCurrentUser ? currentUserProfile : null) ||
        directProfile ||
        directFriend ||
        sidebarFriend || {
          displayNameFontId: message.senderDisplayNameFontId,
          displayNameEffectId: message.senderDisplayNameEffectId,
          displayNamePrimaryHex: message.senderDisplayNamePrimaryHex,
          displayNameAccentHex: message.senderDisplayNameAccentHex,
        };
      return getDisplayNameTextStyle(source, messagesShellTheme);
    },
    [
      currentUserProfile,
      dmProfileDetail,
      selectedDirectMessageFriend,
      friends,
      messagesShellTheme,
    ],
  );
  const [passkeyRequired, setPasskeyRequired] = useState(false);
  const [passkeyChecking, setPasskeyChecking] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [passkeyInput, setPasskeyInput] = useState("");
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [passkeySubmitting, setPasskeySubmitting] = useState(false);

  // Media picker states
  const [showGiphyPicker, setShowGiphyPicker] = useState(false);
  const [mediaPickerTab, setMediaPickerTab] = useState<MediaPickerTab>("gif");
  const [serverEmojiRenderMap, setServerEmojiRenderMap] = useState<
    Record<string, string>
  >({});
  const [showPlusMenu, setShowPlusMenu] = useState(false);

  // Voice recording states
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);

  /** Tắt/bật mic và loa trong thanh voice controls (dùng cả khi xem DM và khi ở server). */
  const [voiceMicMuted, setVoiceMicMuted] = useState(false);
  const [voiceSoundMuted, setVoiceSoundMuted] = useState(false);
  /** Lưu trạng thái mute theo từng kênh thoại (serverId:channelId). */
  const [voiceMuteByChannel, setVoiceMuteByChannel] = useState<
    Record<string, { micMuted: boolean; soundMuted: boolean }>
  >({});
  /** Kênh thoại đang kết nối LiveKit (giữ khi user chuyển sang kênh chat). */
  const [joinedVoiceChannelId, setJoinedVoiceChannelId] = useState<string | null>(null);

  // Poll states
  const [showCreatePollModal, setShowCreatePollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollDuration, setPollDuration] = useState(24);
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);

  // Message reactions and actions states
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState<{
    messageId: string;
    position: { top?: number; bottom?: number; left?: number; right?: number };
  } | null>(null);
  const [showActionsMenu, setShowActionsMenu] = useState<{
    messageId: string;
    position: { top?: number; bottom?: number; left?: number; right?: number };
    isOwnMessage: boolean;
    isPinned: boolean;
  } | null>(null);
  const [showReportDialog, setShowReportDialog] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<UIMessage | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [channelProfileContext, setChannelProfileContext] =
    useState<ChannelProfileAnchorContext | null>(null);

  // Call states
  const [isInCall, setIsInCall] = useState(false);
  const [callToken, setCallToken] = useState<string>("");
  const [callServerUrl, setCallServerUrl] = useState<string>("");
  const [isAudioOnly, setIsAudioOnly] = useState(false);
  const [incomingCall, setIncomingCall] = useState<{
    from: string;
    type: "audio" | "video";
    callerInfo: {
      userId: string;
      username: string;
      displayName: string;
      avatar?: string;
    };
    status?: "incoming" | "cancelled"; // ✅ Added status for when caller cancels
  } | null>(null);
  const [outgoingCall, setOutgoingCall] = useState<{
    to: string;
    toUser: {
      displayName: string;
      username: string;
      avatarUrl?: string;
    };
    type: "audio" | "video";
    status: "calling" | "rejected" | "no-answer";
    roomName?: string;
  } | null>(null);

  // Typing indicator
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false); // ✅ Track typing state
  const shouldAutoScrollRef = useRef(true); // Track if we should auto-scroll

  // Use direct messages hook
  const {
    isConnected,
    newMessage,
    messageSent,
    sendMessage: emitSendMessage,
    onlineUsers,
    presenceByUserId,
    subscribePresence,
    userTyping,
    notifyTyping,
    messagesRead,
    reactionUpdate,
    markAsRead,
    markAllAsRead,
    callEvent,
    callEnded,
    messageDeleted,
    initiateCall,
    answerCall,
    rejectCall,
    endCall,
    emitDeleteMessage,
  } = useDirectMessages({
    userId: currentUserId,
    token,
  });

  // DM presence subscriptions (only peers we render in DM list)
  useEffect(() => {
    if (!selectedServer && typeof subscribePresence === "function") {
      const ids = Array.isArray(friends) ? friends.map((f) => f._id).filter(Boolean) : [];
      subscribePresence(ids);
    }
  }, [friends, selectedServer, subscribePresence]);

  const prevChannelRef = useRef<string | null>(null);
  /** Luôn là kênh đang chọn (tránh closure cũ sau await trong loadMessages). */
  const selectedChannelRef = useRef<string | null>(null);
  useEffect(() => {
    selectedChannelRef.current = selectedChannel;
  }, [selectedChannel]);

  // DM sidebar: fetch full main profile (member since + mutual servers).
  useEffect(() => {
    let cancelled = false;
    const uid = selectedDirectMessageFriend?._id;
    if (!uid || !token) {
      setDmProfileDetail(null);
      return;
    }
    fetchProfileDetail({ token, id: uid })
      .then((d) => {
        if (!cancelled) setDmProfileDetail(d);
      })
      .catch(() => {
        if (!cancelled) setDmProfileDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDirectMessageFriend?._id, token]);

  const {
    isConnected: isChannelSocketConnected,
    newMessageChannel,
    reactionUpdateChannel,
    channelNotification,
    serverDeleted,
    joinChannel,
    leaveChannel,
    clearNewMessageChannel,
    clearChannelNotification,
    clearServerDeleted,
  } = useChannelMessages({ token });

  const inboxRefetchTimerRef = useRef<number | null>(null);
  const scheduleInboxDotRefresh = useCallback(() => {
    if (typeof window === "undefined") return;
    if (inboxRefetchTimerRef.current != null) {
      window.clearTimeout(inboxRefetchTimerRef.current);
    }
    inboxRefetchTimerRef.current = window.setTimeout(() => {
      fetchInboxForYou()
        .then((res) => {
          const hasUnread = (res.items ?? []).some((i) => i.seen !== true);
          setHasInboxNotification(hasUnread);
        })
        .catch(() => undefined);
    }, 400);
  }, []);

  // Realtime: when a channel notification arrives, show inbox dot immediately (no reload).
  useEffect(() => {
    if (!channelNotification) return;
    setHasInboxNotification(true);
    scheduleInboxDotRefresh();
    clearChannelNotification();
  }, [channelNotification, clearChannelNotification, scheduleInboxDotRefresh]);

  // Realtime: server removed — drop from sidebar, clear open server/channel/voice, inbox + toast.
  useEffect(() => {
    if (!serverDeleted) return;
    const sid = serverDeleted.serverId;
    const label =
      (serverDeleted.serverName && String(serverDeleted.serverName).trim()) ||
      serversRef.current.find((s) => s._id === sid)?.name ||
      t("chat.popups.inbox.serverFallback");

    if (selectedServerRef.current === sid && selectedChannelRef.current) {
      leaveChannel(selectedChannelRef.current);
    }

    setServers((prev) => prev.filter((s) => s._id !== sid));

    if (selectedServerRef.current === sid) {
      setSelectedServer(null);
      setSelectedChannel(null);
      setInfoChannels([]);
      setTextChannels([]);
      setVoiceChannels([]);
      setAllChannels([]);
      setServerCategories([]);
      setMessages([]);
      setJoinedVoiceChannelId(null);
      setVoiceChannelCallToken(null);
      setVoiceChannelCallServerUrl("");
      setVoiceChannelCallError(null);
      setVoiceChannelParticipants({});
      setServerInteractionSettings(null);
      setMemberRoleColors({});
    }

    if (serverSettingsTargetRef.current?.serverId === sid) {
      setShowServerSettingsPanel(false);
      setServerSettingsTarget(null);
    }

    setHasInboxNotification(true);
    scheduleInboxDotRefresh();
    setToastMessage(t("chat.popups.inbox.serverDeletedToast", { server: label }));
    window.setTimeout(() => setToastMessage(null), 4000);
    clearServerDeleted();
  }, [serverDeleted, leaveChannel, scheduleInboxDotRefresh, clearServerDeleted, t]);

  // Fallback: cover non-socket cases (server_invite / for-you items) without requiring reload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!currentUserId) return;

    let cancelled = false;
    const refetch = async () => {
      try {
        const res = await fetchInboxForYou();
        const hasUnread = (res.items ?? []).some((i) => i.seen !== true);
        if (!cancelled) setHasInboxNotification(hasUnread);
      } catch (_) {
        // ignore
      }
    };

    refetch();
    const id = window.setInterval(refetch, 8000);

    const onFocus = () => refetch();
    const onVis = () => {
      if (document.visibilityState === "visible") refetch();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [currentUserId]);

  // ✅ Sync reactions from WebSocket so both users see updates
  useEffect(() => {
    if (!reactionUpdate) return;
    const { messageId, reactions } = reactionUpdate;
    setConversations((prev) => {
      const newMap = new Map(prev);
      for (const [friendId, list] of newMap.entries()) {
        const idx = (list || []).findIndex((m) => m.id === messageId);
        if (idx === -1) continue;
        const updated = [...(list || [])];
        updated[idx] = {
          ...updated[idx],
          reactions: normalizeReactions(reactions),
        };
        newMap.set(friendId, updated);
      }
      return newMap;
    });
  }, [reactionUpdate]);

  // ✅ Sync channel reaction updates from WebSocket (nhiều thành viên trong kênh)
  useEffect(() => {
    if (!reactionUpdateChannel || !selectedChannel) return;
    const { messageId, reactions } = reactionUpdateChannel;
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === messageId);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        reactions: normalizeReactions(reactions),
      };
      return next;
    });
  }, [reactionUpdateChannel, selectedChannel]);

  // ✅ New message in channel from WebSocket (thành viên khác gửi → hiện ngay không cần reload)
  useEffect(() => {
    if (!newMessageChannel?.message || !selectedChannel) return;
    if (myServerAccessStatus?.chatViewBlocked) {
      clearNewMessageChannel();
      return;
    }
    const msg = newMessageChannel.message as any;
    const channelId = typeof msg.channelId === "string" ? msg.channelId : msg.channelId?._id ?? msg.channelId;
    if (channelId !== selectedChannel) return;
    const senderId = typeof msg.senderId === "string" ? msg.senderId : msg.senderId?._id;
    if (senderId === currentUserId) return;

    const srvId = selectedServerRef.current;
    const rawMentions = (msg as any).mentions ?? [];
    const mentionIds = Array.isArray(rawMentions)
      ? rawMentions.map((m: any) => (typeof m === "string" ? m : m?._id ?? m)).filter(Boolean)
      : [];
    const chMeta = allChannels.find((c) => c._id === channelId);
    const categoryId = chMeta?.categoryId ?? null;
    if (
      srvId &&
      currentUserId &&
      shouldPlayChannelMessageNotificationSound({
        content: String((msg as any).content ?? ""),
        mentionIds,
        currentUserId,
        currentUsername: currentUserProfile?.username,
        prefs: sidebarPrefs.getServerPrefs(currentUserId, srvId),
        channelId,
        categoryId,
        roleNames: notificationRoleNames,
      })
    ) {
      playMessageNotificationSound();
    }
    const senderNickname = srvId
      ? serversRef.current
          .find((s) => s._id === srvId)
          ?.members?.find((m) => String(m.userId) === String(senderId))?.nickname ?? null
      : null;
    const trimmedNick = typeof senderNickname === "string" ? senderNickname.trim() : "";
    const uiMessage: UIMessage = {
      id: msg._id,
      text: msg.content,
      senderId: senderId ?? "",
      senderEmail: typeof msg.senderId === "object" ? msg.senderId?.email ?? "" : "",
      senderName: typeof msg.senderId === "object" ? (msg.senderId?.username || msg.senderId?.email) ?? "" : "",
      senderDisplayName: trimmedNick || (typeof msg.senderId === "object" ? msg.senderId?.displayName : undefined),
      senderAvatar: typeof msg.senderId === "object" ? (msg.senderId?.avatarUrl ?? msg.senderId?.avatar) : undefined,
      timestamp: new Date(msg.createdAt),
      isFromCurrentUser: false,
      type: "server",
      messageType: msg.messageType || "text",
      giphyId: msg.giphyId || undefined,
      customStickerUrl: (msg as serversApi.Message).customStickerUrl || undefined,
      serverStickerId:
        (msg as serversApi.Message).serverStickerId != null
          ? String((msg as serversApi.Message).serverStickerId)
          : undefined,
      voiceUrl: msg.voiceUrl ?? undefined,
      voiceDuration: msg.voiceDuration ?? undefined,
      stickerReplyWelcomeEnabled: msg.stickerReplyWelcomeEnabled,
      contentModerationResult: msg.contentModerationResult ?? "none",
      reactions: normalizeReactions(msg.reactions),
      replyTo: msg.replyTo && typeof msg.replyTo === "object" ? msg.replyTo._id : typeof msg.replyTo === "string" ? msg.replyTo : undefined,
      replyToMessage: mapReplyToMessage(msg.replyTo && typeof msg.replyTo === "object" ? msg.replyTo : null),
    };
    setMessages((prev) => appendServerMessage(prev, uiMessage));
    shouldAutoScrollRef.current = true;
    clearNewMessageChannel();
  }, [
    newMessageChannel,
    selectedChannel,
    currentUserId,
    clearNewMessageChannel,
    myServerAccessStatus?.chatViewBlocked,
    allChannels,
    notificationRoleNames,
    currentUserProfile?.username,
  ]);

  // Cleanup typing timeout on unmount or friend change
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (isTypingRef.current && selectedDirectMessageFriend && notifyTyping) {
        notifyTyping(selectedDirectMessageFriend._id, false);
      }
    };
  }, [selectedDirectMessageFriend, notifyTyping]);

  // ✅ Call handlers - Show outgoing popup first
  const handleStartCall = useCallback(
    async (isVideo: boolean) => {
      if (!selectedDirectMessageFriend || !token || !currentUserProfile) {
        console.error("Cannot start call: missing friend, token, or profile");
        return;
      }

      try {
        console.log(
          "📞 [CALL] Starting",
          isVideo ? "video" : "audio",
          "call with",
          selectedDirectMessageFriend.displayName,
        );

        // Get room name first
        const { roomName } = await getDMRoomName(
          selectedDirectMessageFriend._id,
          token,
        );
        console.log("📞 [CALL] Room name:", roomName);

        // Show outgoing call popup
        setOutgoingCall({
          to: selectedDirectMessageFriend._id,
          toUser: {
            displayName:
              selectedDirectMessageFriend.displayName ||
              selectedDirectMessageFriend.username,
            username: selectedDirectMessageFriend.username,
            avatarUrl: selectedDirectMessageFriend.avatarUrl,
          },
          type: isVideo ? "video" : "audio",
          status: "calling",
          roomName,
        });

        // Notify receiver via socket
        initiateCall(
          selectedDirectMessageFriend._id,
          isVideo ? "video" : "audio",
        );
        console.log("✅ [CALL] Call notification sent, waiting for answer...");
      } catch (error) {
        console.error("❌ [CALL] Failed to start call:", error);
        setError("Không thể bắt đầu cuộc gọi");
      }
    },
    [selectedDirectMessageFriend, token, currentUserProfile, initiateCall],
  );

  const handleEndCall = useCallback(() => {
    console.log("📞 [CALL] Ending call");
    setIsInCall(false);
    setCallToken("");
    setCallServerUrl("");
    setIsAudioOnly(false);
  }, []);

  // ✅ Accept incoming call - notify caller and open tabs for both
  const handleAcceptCall = useCallback(async () => {
    if (!incomingCall || !token || !currentUserProfile) {
      console.error("Cannot accept call: missing data");
      return;
    }

    try {
      console.log(
        "📞 [ACCEPT] Accepting call from:",
        incomingCall.callerInfo.displayName,
      );

      // Mark this call as processed
      processedCallsRef.current.add(incomingCall.from);
      console.log("✅ [ACCEPT] Marked call as processed");

      // Get room name
      const { roomName } = await getDMRoomName(incomingCall.from, token);
      console.log("📞 [ACCEPT] Room name:", roomName);

      // Notify caller that call was answered (this will open tab on caller's side)
      answerCall(incomingCall.from, { roomName });
      console.log("✅ [ACCEPT] Call answer notification sent to caller");

      // Open call in new tab for receiver (this user)
      const participantName =
        currentUserProfile.username || currentUserProfile.displayName || "Người dùng";
      const isAudioOnly = incomingCall.type === "audio";
      const callUrl = `/call?roomName=${encodeURIComponent(roomName)}&participantName=${encodeURIComponent(participantName)}&audioOnly=${isAudioOnly}`;

      window.open(callUrl, "_blank", "noopener,noreferrer");
      console.log("✅ [ACCEPT] Call window opened for receiver (not host)");

      // Close popup
      setIncomingCall(null);

      // Clear processed call after 10 seconds to allow new calls from same user
      setTimeout(() => {
        processedCallsRef.current.delete(incomingCall.from);
        console.log("🔄 [CLEANUP] Cleared processed call from", incomingCall.from);
      }, 10000);
    } catch (error) {
      console.error("❌ [ACCEPT] Failed to accept call:", error);
      setError("Không thể chấp nhận cuộc gọi");
      // Remove from processed on error
      processedCallsRef.current.delete(incomingCall.from);
    }
  }, [incomingCall, token, currentUserProfile, answerCall]);

  // ✅ Reject incoming call
  const handleRejectCall = useCallback(() => {
    if (!incomingCall) return;

    console.log(
      "📞 [REJECT] Rejecting call from:",
      incomingCall.callerInfo.displayName,
    );

    // Mark this call as processed
    processedCallsRef.current.add(incomingCall.from);
    console.log("✅ [REJECT] Marked call as processed");

    rejectCall(incomingCall.from);
    setIncomingCall(null);

    // Clear processed call after 5 seconds
    setTimeout(() => {
      processedCallsRef.current.delete(incomingCall.from);
      console.log("🔄 [CLEANUP] Cleared processed call from", incomingCall.from);
    }, 5000);
  }, [incomingCall, rejectCall]);

  // ✅ Cancel outgoing call
  const handleCancelCall = useCallback(() => {
    if (!outgoingCall) return;

    console.log(
      "📞 [CANCEL] Canceling outgoing call to:",
      outgoingCall.toUser.displayName,
    );

    // Notify receiver that call was cancelled
    endCall(outgoingCall.to);

    // Close popup
    setOutgoingCall(null);
  }, [outgoingCall, endCall]);

  // ✅ Open call tab when receiver accepts (for caller)
  const openCallTab = useCallback(async () => {
    if (!outgoingCall || !currentUserProfile) return;

    try {
      const participantName =
        currentUserProfile.username || currentUserProfile.displayName || "Người dùng";
      const isAudioOnly = outgoingCall.type === "audio";
      const callUrl = `/call?roomName=${encodeURIComponent(outgoingCall.roomName!)}&participantName=${encodeURIComponent(participantName)}&audioOnly=${isAudioOnly}`;

      window.open(callUrl, "_blank", "noopener,noreferrer");
      console.log("✅ [CALLER] Call window opened after acceptance (as host)");

      // Close outgoing popup
      setOutgoingCall(null);
    } catch (error) {
      console.error("❌ [CALLER] Failed to open call window:", error);
    }
  }, [outgoingCall, currentUserProfile]);

  // ✅ Handle incoming call & call events
  useEffect(() => {
    if (!callEvent) return;

    // Incoming call notification
    if (callEvent.from && callEvent.callerInfo) {
      // Create unique call ID
      const callId = `${callEvent.from}-${callEvent.type}-${Date.now()}`;

      // Check if this call was already processed (accepted/rejected)
      if (processedCallsRef.current.has(callEvent.from)) {
        console.log(
          "📞 [SKIP] Call from",
          callEvent.callerInfo.displayName,
          "already processed",
        );
        return;
      }

      // Check if we already have an incoming call from this user
      if (incomingCall && incomingCall.from === callEvent.from) {
        console.log(
          "📞 [SKIP] Already have incoming call from",
          callEvent.callerInfo.displayName,
        );
        return;
      }

      console.log(
        "📞 [INCOMING] Received call from:",
        callEvent.callerInfo.displayName,
      );
      console.log("📞 [INCOMING-DEBUG] CallerInfo data:", callEvent.callerInfo);
      setIncomingCall({
        from: callEvent.from,
        type: callEvent.type || "audio",
        callerInfo: callEvent.callerInfo,
        status: "incoming",
      });
      return;
    }

    // Call answered - open tab for caller
    if (callEvent.sdpOffer && outgoingCall) {
      console.log("📞 [ANSWER] Call was answered, opening call window...");
      openCallTab();
      return;
    }
  }, [callEvent, outgoingCall, openCallTab, incomingCall]);

  // ✅ Handle call-ended event (when caller cancels while receiver has incoming popup)
  useEffect(() => {
    if (!callEnded) return;

    console.log(
      "📞 [CALL-ENDED] Received call-ended event from:",
      callEnded.from,
    );

    // If receiver has incoming call popup open, update it to show "cancelled"
    // ✅ Use callback to avoid dependency on incomingCall state
    setIncomingCall((prev) => {
      if (prev && prev.from === callEnded.from) {
        console.log(
          "📞 [CALL-ENDED] Updating incoming call to cancelled status",
        );
        return { ...prev, status: "cancelled" };
      }
      return prev;
    });

    // Auto-close after 3 seconds if call was cancelled
    const timer = setTimeout(() => {
      setIncomingCall((prev) => {
        if (
          prev &&
          prev.from === callEnded.from &&
          prev.status === "cancelled"
        ) {
          return null;
        }
        return prev;
      });
    }, 3000);

    return () => clearTimeout(timer);
  }, [callEnded]); // ✅ Only depend on callEnded, not incomingCall

  // ✅ Listen for call-rejected event
  useEffect(() => {
    if (!callEvent) return;

    // Check if this is a call-rejected event
    if (
      callEvent.type === undefined &&
      callEvent.sdpOffer === undefined &&
      callEvent.callerInfo === undefined
    ) {
      console.log("📞 [REJECTED] Call was rejected");

      // ✅ Use callback to avoid dependency on outgoingCall state
      setOutgoingCall((prev) => {
        if (prev && prev.status !== "rejected") {
          return { ...prev, status: "rejected" };
        }
        return prev;
      });

      // Auto-close popup after 3 seconds
      const timer = setTimeout(() => {
        setOutgoingCall((prev) => {
          if (prev && prev.status === "rejected") {
            return null;
          }
          return prev;
        });
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [callEvent]); // ✅ Only depend on callEvent, not outgoingCall

  // ✅ Handle messages read event - update UI when messages are read
  useEffect(() => {
    if (
      messagesRead &&
      messagesRead.messageIds &&
      messagesRead.messageIds.length > 0
    ) {
      console.log(
        "📖 [FRONTEND] Messages marked as read by:",
        messagesRead.byUserId,
      );
      console.log(
        "📖 [FRONTEND] Message IDs to update:",
        messagesRead.messageIds,
      );

      // ✅ ONLY update conversations Map (used for DM rendering)
      // This prevents duplicate key errors by maintaining a single source of truth
      setConversations((prev) => {
        const newMap = new Map(prev);
        let updateCount = 0;

        newMap.forEach((msgs, friendId) => {
          const updated = msgs.map((msg) => {
            if (messagesRead.messageIds.includes(msg.id)) {
              console.log(
                "✅ [FRONTEND] Updating message to isRead=true:",
                msg.id,
              );
              updateCount++;
              return { ...msg, isRead: true };
            }
            return msg;
          });
          newMap.set(friendId, updated);
        });

        console.log(
          `📊 [FRONTEND] Updated ${updateCount} messages across ${newMap.size} conversations`,
        );
        return newMap;
      });
    }
  }, [messagesRead]); // ✅ FIX: Only depend on messagesRead, NOT conversations (Map object changes every time)

  // ✅ Track which messages are visible and mark them as read
  const visibleMessagesRef = useRef<Set<string>>(new Set());
  const markAsReadTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // ✅ Intersection Observer callback to detect visible messages
  const handleMessageVisible = useCallback(
    (messageId: string, isVisible: boolean) => {
      if (!selectedDirectMessageFriend || !markAsRead) return;

      // Check message in conversations (since we're using that for DM rendering)
      const conversationMessages =
        conversations.get(selectedDirectMessageFriend._id) || [];
      const message = conversationMessages.find((m) => m.id === messageId);

      if (!message || message.isFromCurrentUser || message.isRead) {
        // Skip if already marked or if it's our own message
        return;
      }

      if (isVisible) {
        // Message is visible - start timer to mark as read after 2 seconds
        if (!markAsReadTimersRef.current.has(messageId)) {
          console.log("👁️ Message visible, starting 2s timer:", messageId);

          const timer = setTimeout(() => {
            console.log(
              "✅ Timer complete! Marking message as read:",
              messageId,
            );
            console.log(
              "📤 Sending mark-as-read event to:",
              selectedDirectMessageFriend._id,
            );

            // Mark as read via WebSocket
            markAsRead([messageId], selectedDirectMessageFriend._id);

            // ✅ OPTIMISTIC UPDATE: Only update the conversations Map (used for DM rendering)
            // Don't update messages array to avoid duplicate renders
            setConversations((prev) => {
              const newMap = new Map(prev);
              const msgs = newMap.get(selectedDirectMessageFriend._id) || [];
              newMap.set(
                selectedDirectMessageFriend._id,
                msgs.map((m) =>
                  m.id === messageId ? { ...m, isRead: true } : m,
                ),
              );
              return newMap;
            });

            visibleMessagesRef.current.add(messageId);
            markAsReadTimersRef.current.delete(messageId);
          }, 2000); // 2 seconds of visibility required

          markAsReadTimersRef.current.set(messageId, timer);
        }
      } else {
        // Message is no longer visible - cancel timer
        const timer = markAsReadTimersRef.current.get(messageId);
        if (timer) {
          console.log("👁️ Message hidden, canceling timer:", messageId);
          clearTimeout(timer);
          markAsReadTimersRef.current.delete(messageId);
        }
      }
    },
    [selectedDirectMessageFriend, conversations, markAsRead],
  );

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      markAsReadTimersRef.current.forEach((timer) => clearTimeout(timer));
      markAsReadTimersRef.current.clear();
    };
  }, []);

  // Store admin token in localStorage before the init effect reads it.
  // Effects fire in declaration order, so this runs first.
  useEffect(() => {
    if (adminTokenFromUrl) {
      localStorage.setItem("accessToken", adminTokenFromUrl);
    }
  }, [adminTokenFromUrl]);

  // Admin chỉ xem server: không mở Khám phá / tránh lệch giao diện (sidebar server + nội dung Explore).
  useEffect(() => {
    if (!isAdminView) return;
    setShowExploreView(false);
    setShowJoinApplicationsView(false);
  }, [isAdminView]);

  // Load servers on mount
  useEffect(() => {
    const authToken =
      localStorage.getItem("accessToken") || localStorage.getItem("token");
    if (authToken) {
      setToken(authToken);
      try {
        const payload = JSON.parse(atob(authToken.split(".")[1]));
        const userId = payload.userId || payload.sub;
        setCurrentUserId(userId);
        console.log("Current User ID:", userId);
        setError(null);
        if (!isAdminView) {
          loadServers();
          loadAvailableUsers();
          loadCurrentUserProfile(authToken);
        } else {
          setLoading(false);
        }
      } catch (e) {
        console.error("Failed to parse token", e);
        if (!isAdminView) {
          setError("Mã token không hợp lệ");
        } else {
          setLoading(false);
        }
      }
    } else if (!isAdminView) {
      setError("Vui lòng đăng nhập trước");
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    const id = getDeviceId();
    setDeviceId(id);
    setPasskeyChecking(true);
    fetchDeviceTrustStatus({ token, deviceId: id })
      .then((res) => {
        if (res.hasPasskey && !res.trusted) {
          setPasskeyRequired(true);
        } else {
          setPasskeyRequired(false);
        }
      })
      .catch(() => {
        setPasskeyRequired(false);
      })
      .finally(() => setPasskeyChecking(false));
  }, [token]);

  const handleVerifyPasskeyGate = async () => {
    setPasskeyError(null);
    if (!passkeyInput.trim()) {
      setPasskeyError("Vui lòng nhập mã xác minh 6 số.");
      return;
    }
    if (!/^\d{6}$/.test(passkeyInput)) {
      setPasskeyError("Mã xác minh phải đúng 6 chữ số.");
      return;
    }
    if (!token || !deviceId) {
      setPasskeyError("Phiên hết hạn. Vui lòng đăng nhập lại.");
      return;
    }
    setPasskeySubmitting(true);
    try {
      await verifyDeviceTrust({ token, deviceId, passkey: passkeyInput });
      setPasskeyRequired(false);
      setPasskeyInput("");
    } catch (err) {
      const message =
        typeof err === "object" && err && "message" in err
          ? String((err as { message?: string }).message)
          : "Unable to verify passkey.";
      setPasskeyError(message || "Không thể xác minh mã.");
    } finally {
      setPasskeySubmitting(false);
    }
  };

  const loadCurrentUserProfile = async (token: string) => {
    try {
      const profile = await fetchCurrentProfile({ token });
      console.log("✅ Loaded current user profile:", profile);
      setCurrentUserProfile(profile);
    } catch (err) {
      console.error("❌ Failed to load current user profile", err);
    }
  };

  const loadFollowing = async () => {
    try {
      const followingList = await serversApi.getFollowing();
      setFriends(followingList);
    } catch (err) {
      console.error("Failed to load following", err);
      setFriends([]);
    }
  };

  const loadAvailableUsers = useCallback(async () => {
    try {
      const usersList = await getAvailableUsers({ token });
      setFriends(usersList);
    } catch (err) {
      console.error("Failed to load available users", err);
      // Fallback to loading following if available users endpoint is not ready
      loadFollowing();
    }
  }, [token]);

  const friendsForDmSidebar = useMemo(() => {
    // Apply realtime presence overrides when available
    let list = friends.map((f) => {
      const st = (presenceByUserId as any)?.[f._id] as string | undefined;
      if (st === "online" || st === "idle") return { ...f, isOnline: true };
      if (st === "offline") return { ...f, isOnline: false };
      return f;
    });
    if (dmSidebarPeersModeState === "online") {
      list = list.filter((f) => f.isOnline === true);
    }
    if (chatUserSettings?.dmListFrom === "followers_only") {
      list = list.filter((f) => followingIds.has(f._id));
    }
    return list;
  }, [
    friends,
    presenceByUserId,
    dmSidebarPeersModeState,
    chatUserSettings?.dmListFrom,
    followingIds,
  ]);

  useEffect(() => {
    const onDm = () => setDmSidebarPeersModeState(getDmSidebarPeersMode());
    const onChat = () => {
      const auth =
        typeof window !== "undefined"
          ? localStorage.getItem("accessToken")
          : null;
      if (!auth) return;
      void fetchUserSettings({ token: auth })
        .then(setChatUserSettings)
        .catch(() => {});
    };
    window.addEventListener("cordigram-dm-sidebar-prefs", onDm);
    window.addEventListener("cordigram-chat-settings", onChat);
    return () => {
      window.removeEventListener("cordigram-dm-sidebar-prefs", onDm);
      window.removeEventListener("cordigram-chat-settings", onChat);
    };
  }, []);

  // Realtime: reflect profile style/avatar updates in DM sidebar + open DM profile panel.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStyle = (e: Event) => {
      const ce = e as CustomEvent;
      const d = (ce?.detail ?? {}) as {
        userId?: string;
        avatarUrl?: string | null;
        displayName?: string;
        username?: string;
        displayNameFontId?: string | null;
        displayNameEffectId?: string | null;
        displayNamePrimaryHex?: string | null;
        displayNameAccentHex?: string | null;
      };
      const uid = d?.userId ? String(d.userId) : "";
      if (!uid) return;

      if ("avatarUrl" in d || "displayName" in d || "username" in d) {
        setFriends((prev) =>
          prev.map((f) =>
            String(f._id) !== uid
              ? f
              : ({
                  ...f,
                  avatarUrl: "avatarUrl" in d ? (d.avatarUrl ?? f.avatarUrl) : f.avatarUrl,
                  displayName: d.displayName ?? f.displayName,
                  username: d.username ?? f.username,
                  displayNameFontId:
                    "displayNameFontId" in d ? (d.displayNameFontId ?? f.displayNameFontId) : f.displayNameFontId,
                  displayNameEffectId:
                    "displayNameEffectId" in d ? (d.displayNameEffectId ?? f.displayNameEffectId) : f.displayNameEffectId,
                  displayNamePrimaryHex:
                    "displayNamePrimaryHex" in d ? (d.displayNamePrimaryHex ?? f.displayNamePrimaryHex) : f.displayNamePrimaryHex,
                  displayNameAccentHex:
                    "displayNameAccentHex" in d ? (d.displayNameAccentHex ?? f.displayNameAccentHex) : f.displayNameAccentHex,
                } as any),
          ),
        );
      }

      setSelectedDirectMessageFriend((prev) => {
        if (!prev || String(prev._id) !== uid) return prev;
        return {
          ...prev,
          avatarUrl: "avatarUrl" in d ? (d.avatarUrl ?? prev.avatarUrl) : prev.avatarUrl,
          displayName: d.displayName ?? prev.displayName,
          username: d.username ?? prev.username,
          displayNameFontId:
            "displayNameFontId" in d ? (d.displayNameFontId ?? prev.displayNameFontId) : prev.displayNameFontId,
          displayNameEffectId:
            "displayNameEffectId" in d ? (d.displayNameEffectId ?? prev.displayNameEffectId) : prev.displayNameEffectId,
          displayNamePrimaryHex:
            "displayNamePrimaryHex" in d ? (d.displayNamePrimaryHex ?? prev.displayNamePrimaryHex) : prev.displayNamePrimaryHex,
          displayNameAccentHex:
            "displayNameAccentHex" in d ? (d.displayNameAccentHex ?? prev.displayNameAccentHex) : prev.displayNameAccentHex,
        } as any;
      });

      setDmProfileDetail((prev) => {
        if (!prev || String((prev as any).userId) !== uid) return prev;
        return {
          ...(prev as any),
          avatarUrl: "avatarUrl" in d ? (d.avatarUrl ?? (prev as any).avatarUrl) : (prev as any).avatarUrl,
          displayName: d.displayName ?? (prev as any).displayName,
          username: d.username ?? (prev as any).username,
          displayNameFontId:
            "displayNameFontId" in d ? (d.displayNameFontId ?? (prev as any).displayNameFontId) : (prev as any).displayNameFontId,
          displayNameEffectId:
            "displayNameEffectId" in d ? (d.displayNameEffectId ?? (prev as any).displayNameEffectId) : (prev as any).displayNameEffectId,
          displayNamePrimaryHex:
            "displayNamePrimaryHex" in d ? (d.displayNamePrimaryHex ?? (prev as any).displayNamePrimaryHex) : (prev as any).displayNamePrimaryHex,
          displayNameAccentHex:
            "displayNameAccentHex" in d ? (d.displayNameAccentHex ?? (prev as any).displayNameAccentHex) : (prev as any).displayNameAccentHex,
        } as any;
      });

      setCurrentUserProfile((prev: any) => {
        if (!prev || String(prev.userId ?? prev.id ?? "") !== uid) return prev;
        return {
          ...prev,
          avatarUrl: "avatarUrl" in d ? (d.avatarUrl ?? prev.avatarUrl) : prev.avatarUrl,
          displayName: d.displayName ?? prev.displayName,
          username: d.username ?? prev.username,
          displayNameFontId:
            "displayNameFontId" in d ? (d.displayNameFontId ?? prev.displayNameFontId) : prev.displayNameFontId,
          displayNameEffectId:
            "displayNameEffectId" in d ? (d.displayNameEffectId ?? prev.displayNameEffectId) : prev.displayNameEffectId,
          displayNamePrimaryHex:
            "displayNamePrimaryHex" in d ? (d.displayNamePrimaryHex ?? prev.displayNamePrimaryHex) : prev.displayNamePrimaryHex,
          displayNameAccentHex:
            "displayNameAccentHex" in d ? (d.displayNameAccentHex ?? prev.displayNameAccentHex) : prev.displayNameAccentHex,
        };
      });
    };

    window.addEventListener("cordigram-user-profile-style-updated", onStyle as any);
    return () => window.removeEventListener("cordigram-user-profile-style-updated", onStyle as any);
  }, []);

  useEffect(() => {
    if (!token) return;
    void fetchUserSettings({ token })
      .then(setChatUserSettings)
      .catch(() => {});
    void fetchBoostStatus({ token })
      .then((b) => {
        setBoostStatus(b);
        const v = (b as any)?.limits?.maxUploadBytes;
        if (typeof v === "number" && Number.isFinite(v) && v > 0) {
          setMaxUploadBytes(v);
        } else {
          setMaxUploadBytes(DEFAULT_FREE_MAX_UPLOAD_BYTES);
        }
      })
      .catch(() => {
        setBoostStatus(null);
        setMaxUploadBytes(DEFAULT_FREE_MAX_UPLOAD_BYTES);
      });
    void serversApi
      .getFollowing()
      .then((list) => setFollowingIds(new Set(list.map((f) => f._id))))
      .catch(() => setFollowingIds(new Set()));
  }, [token]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onBoost = (e: Event) => {
      const detail = (e as CustomEvent<any>).detail;
      if (detail && typeof detail === "object") {
        setBoostStatus((prev) => ({
          ...(prev ?? {}),
          tier: detail?.tier ?? (prev as any)?.tier,
          active: typeof detail?.active === "boolean" ? detail.active : (prev as any)?.active,
          expiresAt: "expiresAt" in detail ? detail?.expiresAt : (prev as any)?.expiresAt,
          limits: detail?.limits ?? (prev as any)?.limits,
        }));
      }
      const v = detail?.limits?.maxUploadBytes;
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        setMaxUploadBytes(v);
      }
    };
    window.addEventListener("cordigram-boost-entitlement-updated", onBoost as any);
    return () =>
      window.removeEventListener(
        "cordigram-boost-entitlement-updated",
        onBoost as any,
      );
  }, []);

  // Debug: Log current user profile when it changes
  useEffect(() => {
    if (currentUserProfile) {
      console.log("🔄 Current User Profile Updated:", currentUserProfile);
    }
  }, [currentUserProfile]);

  // Load channels and active events when server changes
  const loadActiveEvents = useCallback(async (serverId: string) => {
    try {
      const { active, upcoming } = await serversApi.getServerEvents(serverId);
      setActiveServerEvents(active);
      setServerEventsTotalCount(active.length + upcoming.length);
    } catch {
      setActiveServerEvents([]);
      setServerEventsTotalCount(0);
    }
  }, []);

  useEffect(() => {
    if (selectedServer) {
      loadChannels(selectedServer);
      loadActiveEvents(selectedServer);
      setSelectedDirectMessageFriend(null); // Clear selected DM friend when selecting server
      setShowBoostUpgradeView(false);
      
      const isAdminViewedServer = Boolean(isAdminView && adminViewServerId && selectedServer === adminViewServerId);
      if (!isAdminViewedServer) {
        // Fetch member role colors cho server
        serversApi.getServerMembersWithRoles(selectedServer)
          .then((response) => {
            const colorMap: Record<string, string> = {};
            response.members.forEach((member) => {
              if (member.displayColor && member.displayColor !== "#99AAB5") {
                colorMap[member.userId] = member.displayColor;
              }
            });
            setMemberRoleColors(colorMap);
            setMembersForMessageSearch(
              response.members.map((m) => ({
                userId: m.userId,
                displayName: m.displayName,
                username: m.username,
                avatarUrl: m.avatarUrl,
              })),
            );
          })
          .catch((err) => {
            console.error("[MessagesPage] Failed to fetch member role colors:", err);
            setMemberRoleColors({});
            setMembersForMessageSearch([]);
          });
        // Fetch permissions to determine if user can drag channels
        serversApi.getCurrentUserPermissions(selectedServer)
          .then((perms) => {
            setCanDragChannels(perms.isOwner || perms.canManageChannels);
            setCanUseMentions(Boolean(perms.isOwner || perms.mentionEveryone));
          })
          .catch(() => {
            setCanDragChannels(false);
            setCanUseMentions(false);
          });
        // Fetch interaction settings for welcome banner
        serversApi.getInteractionSettings(selectedServer)
          .then((s) => setServerInteractionSettings(s))
          .catch(() => setServerInteractionSettings(null));
      } else {
        // Admin view: do not call member-only endpoints (will 403).
        setMemberRoleColors({});
        setMembersForMessageSearch([]);
        setCanDragChannels(false);
        setCanUseMentions(false);
        setServerInteractionSettings(null);
      }
    } else {
      setInfoChannels([]);
      setTextChannels([]);
      setVoiceChannels([]);
      setAllChannels([]);
      setServerCategories([]);
      setSelectedChannel(null);
      setActiveServerEvents([]);
      setServerEventsTotalCount(0);
      setMemberRoleColors({});
      setMembersForMessageSearch([]);
      setCanDragChannels(false);
      setCanUseMentions(false);
      setServerInteractionSettings(null);
    }
  }, [selectedServer, loadActiveEvents]);

  // If selectedServer no longer exists (deleted/left), stop requesting it.
  useEffect(() => {
    if (!selectedServer) return;
    if (servers.some((s) => s._id === selectedServer)) return;
    setSelectedServer(null);
    setSelectedChannel(null);
    setShowServerSettingsPanel(false);
    setServerSettingsTarget(null);
    setServerSettingsPermissions(null);
  }, [selectedServer, servers]);

  // Fetch "my access status" để biết có cần chấp nhận quy định hay không.
  useEffect(() => {
    if (!selectedServer || selectedDirectMessageFriend) {
      setMyServerAccessStatus(null);
      setShowAcceptRulesModal(false);
      setAcceptRulesLoading(false);
      return;
    }

    // Admin view: bypass all restrictions
    if (isAdminView && selectedServer === adminViewServerId) {
      setMyServerAccessStatus({
        chatViewBlocked: false,
        chatBlockReason: null,
        hasRules: false,
        acceptedRules: true,
        verificationLevel: "none",
        verificationChecks: { emailVerified: true, accountOver5Min: true, memberOver10Min: true },
        verificationWait: { waitAccountSec: 0, waitMemberSec: 0 },
        showAgeRestrictedChannelNotice: false,
      } as any);
      setShowAcceptRulesModal(false);
      return;
    }

    let cancelled = false;
    setMyServerAccessStatus(null);
    setShowAcceptRulesModal(false);

    (async () => {
      try {
        const status = await serversApi.getMyServerAccessStatus(selectedServer);
        if (cancelled) return;
        setMyServerAccessStatus(status);
        const needsRules = status.hasRules && !status.acceptedRules && !status.chatViewBlocked;
        if (needsRules) {
          try {
            const s = await serversApi.getServerAccessSettings(selectedServer);
            if (cancelled) return;
            setVerificationAccessSettings(s);
            setVerificationRulesAgreed(false);
            setShowAcceptRulesModal(true);
          } catch {
            if (!cancelled) setShowAcceptRulesModal(true);
          }
        } else {
          setShowAcceptRulesModal(false);
        }
      } catch {
        if (cancelled) return;
        setMyServerAccessStatus(null);
        setShowAcceptRulesModal(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedServer, selectedDirectMessageFriend]);

  // Khi bị chặn bởi mức xác minh (thời gian), refetch trạng thái để mở chat khi đủ điều kiện.
  useEffect(() => {
    if (!selectedServer || selectedDirectMessageFriend) return;
    if (myServerAccessStatus?.verificationLevel === "none") return;
    if (myServerAccessStatus?.chatBlockReason !== "verification") return;
    const t = setInterval(async () => {
      try {
        const status = await serversApi.getMyServerAccessStatus(selectedServer);
        setMyServerAccessStatus(status);
        if (status.hasRules && !status.acceptedRules && !status.chatViewBlocked) {
          const s = await serversApi.getServerAccessSettings(selectedServer);
          setVerificationAccessSettings(s);
          setVerificationRulesAgreed(false);
          setShowAcceptRulesModal(true);
        }
      } catch {
        /* ignore */
      }
    }, 35000);
    return () => clearInterval(t);
  }, [
    selectedServer,
    selectedDirectMessageFriend,
    myServerAccessStatus?.chatBlockReason,
    myServerAccessStatus?.verificationLevel,
  ]);

  useEffect(() => {
    if ((!verificationRulesOpen && !showAcceptRulesModal) || !selectedServer || selectedDirectMessageFriend) return;
    const id = setInterval(async () => {
      try {
        const s = await serversApi.getMyServerAccessStatus(selectedServer);
        setMyServerAccessStatus(s);
        const stillBlocked = s.chatViewBlocked || (s.hasRules && !s.acceptedRules);
        if (!stillBlocked) {
          setVerificationRulesOpen(false);
          setShowAcceptRulesModal(false);
          setVerificationAccessSettings(null);
          const ch = selectedChannelRef.current;
          if (ch) await loadMessages(ch);
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(id);
  }, [verificationRulesOpen, showAcceptRulesModal, selectedServer, selectedDirectMessageFriend]);

  useEffect(() => {
    setLocalWaitAccountSec(myServerAccessStatus?.verificationWait?.waitAccountSec ?? null);
    setLocalWaitMemberSec(myServerAccessStatus?.verificationWait?.waitMemberSec ?? null);
  }, [myServerAccessStatus?.verificationWait?.waitAccountSec, myServerAccessStatus?.verificationWait?.waitMemberSec]);

  useEffect(() => {
    if (localWaitAccountSec == null && localWaitMemberSec == null) return;
    if ((localWaitAccountSec ?? 0) <= 0 && (localWaitMemberSec ?? 0) <= 0) return;
    const id = setInterval(() => {
      setLocalWaitAccountSec(prev => (prev != null && prev > 0 ? prev - 1 : prev));
      setLocalWaitMemberSec(prev => (prev != null && prev > 0 ? prev - 1 : prev));
    }, 1000);
    return () => clearInterval(id);
  }, [localWaitAccountSec != null && localWaitAccountSec > 0, localWaitMemberSec != null && localWaitMemberSec > 0]);

  useEffect(() => {
    if (emailOtpCooldown <= 0) return;
    const id = setInterval(() => {
      setEmailOtpCooldown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [emailOtpCooldown > 0]);

  useEffect(() => {
    setEmailOtpSent(false);
    setEmailOtpCode("");
    setEmailOtpError(null);
    setEmailOtpCooldown(0);
  }, [selectedServer]);

  const refreshServerEmojiMap = useCallback(async () => {
    if (!selectedServer) {
      setServerEmojiRenderMap({});
      return;
    }
    const authToken =
      localStorage.getItem("accessToken") || localStorage.getItem("token") || "";
    if (!authToken) {
      setServerEmojiRenderMap({});
      return;
    }
    const adminViewingServer =
      isAdminView &&
      adminViewServerId &&
      String(selectedServer) === String(adminViewServerId);
    try {
      const data = adminViewingServer
        ? await serversApi.adminGetEmojiPickerData(selectedServer, authToken)
        : await serversApi.getEmojiPickerData(selectedServer);
      const m: Record<string, string> = {};
      for (const g of data.groups || []) {
        if (String(g.serverId) !== String(selectedServer)) continue;
        for (const e of g.emojis || []) {
          const k = (e.name || "").trim().toLowerCase();
          if (k) m[k] = e.imageUrl;
        }
      }
      setServerEmojiRenderMap(m);
    } catch {
      setServerEmojiRenderMap({});
    }
  }, [selectedServer, token, isAdminView, adminViewServerId]);

  useEffect(() => {
    void refreshServerEmojiMap();
  }, [refreshServerEmojiMap]);

  // Refetch active events mỗi 60s khi đang chọn server → sự kiện xuất hiện đúng lúc khi đến giờ
  useEffect(() => {
    if (!selectedServer) return;
    const interval = setInterval(() => loadActiveEvents(selectedServer), 60000);
    return () => clearInterval(interval);
  }, [selectedServer, loadActiveEvents]);

  // Fetch và cập nhật danh sách người trong từng kênh thoại — mọi thành viên server đều thấy (poll 5s + refetch khi quay lại tab)
  useEffect(() => {
    if (!selectedServer || voiceChannels.length === 0) {
      setVoiceChannelParticipants({});
      return;
    }
    const fetchAll = async () => {
      const next: Record<string, { identity: string; name: string }[]> = {};
      await Promise.all(
        voiceChannels.map(async (ch) => {
          try {
            const { participants } = await getVoiceChannelParticipants(selectedServer, ch._id);
            next[ch._id] = participants;
          } catch {
            next[ch._id] = [];
          }
        }),
      );
      setVoiceChannelParticipants((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchAll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [selectedServer, voiceChannels]);

  // Khi mở popup mời vào server: load follow + followers (merge, bỏ trùng), loại ai đã tham gia server
  useEffect(() => {
    if (!inviteToServerTarget) {
      setInviteToServerCandidates([]);
      return;
    }
    const { serverId: sid } = inviteToServerTarget;
    let cancelled = false;
    Promise.all([
      serversApi.getFollowing(),
      serversApi.getMyFollowers(),
      serversApi.getServer(sid),
    ])
      .then(([following, followers, server]) => {
        if (cancelled) return;
        const memberIds = new Set(
          (server.members || []).map((m) => (typeof m.userId === "string" ? m.userId : (m.userId as any)?.toString?.() ?? ""))
        );
        const byId = new Map<string, serversApi.Friend>();
        [...following, ...followers].forEach((f) => byId.set(f._id, f));
        const candidates = Array.from(byId.values()).filter((f) => !memberIds.has(f._id));
        setInviteToServerCandidates(candidates);
      })
      .catch(() => {
        if (!cancelled) setInviteToServerCandidates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [inviteToServerTarget]);

  // Kiểm tra Hộp thư (Dành cho Bạn) có lời mời vào máy chủ → hiển thị chấm đỏ. Refetch khi quay lại trang (vd sau khi chấp nhận lời mời) để cập nhật badge.
  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;
    fetchInboxForYou()
      .then((res) => {
        if (cancelled) return;
        const hasUnread = (res.items ?? []).some((i) => i.seen !== true);
        setHasInboxNotification(hasUnread);
      })
      .catch(() => {
        if (!cancelled) setHasInboxNotification(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUserId, selectedServer]);

  // Load DM unread counts for friends list and DIRECT MESSAGES indicator
  useEffect(() => {
    if (!token || selectedServer) return;
    let cancelled = false;
    getConversationList({ token })
      .then((list) => {
        if (cancelled) return;
        const counts: Record<string, number> = {};
        list.forEach((c) => {
          if (c.userId) counts[c.userId] = c.unreadCount ?? 0;
        });
        // If user is currently viewing a DM conversation, keep its unread at 0
        // to avoid race where the list fetch completes before mark-as-read does.
        const activeDmId = selectedDirectMessageFriend?._id;
        if (activeDmId) counts[activeDmId] = 0;
        setDmUnreadCounts(counts);
      })
      .catch(() => {
        if (!cancelled) setDmUnreadCounts({});
      });
    return () => { cancelled = true; };
  }, [token, selectedServer, selectedDirectMessageFriend?._id]);

  // Mở server từ link /messages?server=xxx (sau khi join từ event link)
  useEffect(() => {
    const serverIdFromUrl = searchParams.get("server");
    if (serverIdFromUrl && servers.length > 0) {
      const exists = servers.some((s) => s._id === serverIdFromUrl);
      if (exists) setSelectedServer(serverIdFromUrl);
    }
  }, [searchParams, servers]);

  // Admin read-only view: load server data via admin endpoint (no membership needed)
  useEffect(() => {
    if (!isAdminView || !adminViewServerId) return;
    const authToken = localStorage.getItem("accessToken") || localStorage.getItem("token") || "";
    if (!authToken) return;

    serversApi.adminGetServerView(adminViewServerId, authToken).then((data) => {
      const srv = data.server as any;
      const chs = (data.channels || []) as serversApi.Channel[];
      const cats = (data.categories || []) as serversApi.ServerCategory[];
      const bs: BackendServer = {
        _id: srv._id,
        name: srv.name,
        description: srv.description,
        avatarUrl: srv.avatarUrl,
        bannerUrl: srv.bannerUrl,
        ownerId: typeof srv.ownerId === "object" ? srv.ownerId._id : srv.ownerId,
        members: srv.members || [],
        channels: chs,
        memberCount: srv.memberCount,
        isActive: srv.isActive,
        isPublic: srv.isPublic,
        createdAt: srv.createdAt,
        updatedAt: srv.updatedAt,
        infoChannels: chs.filter((c) => c.type === "text" && c.category === "info" && !c.categoryId),
        textChannels: chs.filter((c) => c.type === "text" && c.category !== "info"),
        voiceChannels: chs.filter((c) => c.type === "voice"),
        serverCategories: cats,
      };
      setServers((prev) => {
        const without = prev.filter((s) => s._id !== bs._id);
        return [...without, bs];
      });
      setSelectedServer(bs._id);
    }).catch((err) => console.error("Admin view: failed to load server", err));
  }, [isAdminView, adminViewServerId]);

  // ✅ Handle message-sent event (sender confirmation)
  useEffect(() => {
    if (messageSent) {
      console.log("📤 [SENT] Message sent confirmation received:", messageSent);
      const msg = messageSent as any;
      const friendId = msg.receiverId._id; // For sent messages, friend is always the receiver
      console.log("📤 [SENT] Friend ID:", friendId);
      console.log("📤 [SENT] Current user ID:", currentUserId);

      const uiMessage: UIMessage = {
        id: msg._id,
        text: msg.content,
        senderId: msg.senderId._id,
        senderEmail: msg.senderId.email,
        senderDisplayName: msg.senderId.displayName || undefined,
        senderName: msg.senderId.username || msg.senderId.email,
        senderAvatar: msg.senderId.avatar,
        timestamp: new Date(msg.createdAt),
        isFromCurrentUser: true, // Always true for sent messages
        type: "direct",
        isRead: msg.isRead || false,
        messageType: msg.type || "text",
        giphyId: msg.giphyId || undefined,
        customStickerUrl: msg.customStickerUrl || undefined,
        serverStickerId:
          msg.serverStickerId != null ? String(msg.serverStickerId) : undefined,
        voiceUrl: msg.voiceUrl ?? undefined,
        voiceDuration: msg.voiceDuration ?? undefined,
        reactions: normalizeReactions(msg.reactions),
        replyTo: msg.replyTo?._id || undefined,
        replyToMessage: mapReplyToMessage(msg.replyTo),
      };

      //  Replace optimistic message with real message from server
      setConversations((prev) => {
        const newMap = new Map(prev);
        const currentMessages = newMap.get(friendId) || [];
        console.log(
          "📤 [SENT] Current messages count for friend:",
          currentMessages.length,
        );

        // Find and replace temporary message
        const existingIndex = currentMessages.findIndex(
          (m) => m.id.startsWith("temp-") && m.text === msg.content,
        );

        if (existingIndex !== -1) {
          console.log(
            "✅ [SENT] Replacing optimistic message at index:",
            existingIndex,
          );
          const updated = [...currentMessages];
          updated[existingIndex] = uiMessage;
          newMap.set(friendId, updated);
          console.log("✅ [SENT] Updated messages count:", updated.length);
        } else {
          // Fallback: add if not found (shouldn't happen)
          console.warn("⚠️ [SENT] Optimistic message not found, adding anyway");
          const updated = [...currentMessages, uiMessage];
          newMap.set(friendId, updated);
          console.log("⚠️ [SENT] Added message, new count:", updated.length);
        }

        return newMap;
      });
    }
  }, [messageSent, currentUserId]);

  // ✅ Handle new-message event (incoming messages from others)
  useEffect(() => {
    if (newMessage) {
      console.log("📨 [RECEIVE] New incoming message received:", newMessage);
      const msg = newMessage.message as any;
      const rawSender = msg.senderId;
      const senderIdStr =
        typeof rawSender === "string" ? rawSender : rawSender?._id ?? "";
      if (senderIdStr && senderIdStr === currentUserId) {
        return;
      }
      const friendId =
        typeof rawSender === "string" ? rawSender : rawSender?._id; // For incoming messages, friend is usually the sender
      if (!friendId) return;
      console.log("📨 [RECEIVE] Friend ID (sender):", friendId);
      console.log("📨 [RECEIVE] Current user ID:", currentUserId);
      console.log(
        "📨 [RECEIVE] Message from current user?",
        friendId === currentUserId,
      );
      console.log(
        "📨 [RECEIVE] Currently viewing friend?",
        selectedDirectMessageFriend?._id,
      );
      console.log(
        "📨 [RECEIVE] Is viewing this conversation?",
        selectedDirectMessageFriend?._id === friendId,
      );

      const uiMessage: UIMessage = {
        id: msg._id,
        text: msg.content,
        senderId: friendId,
        senderEmail: typeof rawSender === "object" ? rawSender.email ?? "" : "",
        senderDisplayName:
          typeof rawSender === "object" ? rawSender.displayName || undefined : undefined,
        senderName:
          typeof rawSender === "object"
            ? rawSender.username || rawSender.email || ""
            : "",
        senderAvatar: typeof rawSender === "object" ? rawSender.avatar : undefined,
        timestamp: new Date(msg.createdAt),
        isFromCurrentUser: false, // Always false for incoming messages
        type: "direct",
        isRead: msg.isRead || false,
        messageType: msg.type || "text",
        giphyId: msg.giphyId || undefined,
        customStickerUrl: msg.customStickerUrl || undefined,
        serverStickerId:
          msg.serverStickerId != null ? String(msg.serverStickerId) : undefined,
        voiceUrl: msg.voiceUrl ?? undefined,
        voiceDuration: msg.voiceDuration ?? undefined,
        reactions: normalizeReactions(msg.reactions),
        replyTo: msg.replyTo?._id || undefined,
        replyToMessage: mapReplyToMessage(msg.replyTo),
      };

      console.log("📨 [RECEIVE-DEBUG] Created UIMessage:", {
        id: uiMessage.id,
        messageType: uiMessage.messageType,
        voiceUrl: uiMessage.voiceUrl,
        voiceDuration: uiMessage.voiceDuration,
        rawMsgType: msg.type,
        rawVoiceUrl: msg.voiceUrl,
        rawVoiceDuration: msg.voiceDuration,
      });

      // ✅ Check if sender is in friends list
      const isSenderInFriendsList = friends.some((f) => f._id === friendId);
      if (!isSenderInFriendsList) {
        console.log(
          "🔄 [RECEIVE] Sender not in friends list, reloading friends...",
        );
        // Reload friends list to include the new conversation partner
        loadAvailableUsers();
      }

      // ✅ Add incoming message to conversations Map
      setConversations((prev) => {
        const newMap = new Map(prev);
        const currentMessages = newMap.get(friendId) || [];
        console.log(
          "📨 [RECEIVE] Current messages count for friend:",
          currentMessages.length,
        );
        console.log(
          "📨 [RECEIVE] All conversations:",
          Array.from(newMap.keys()),
        );
        console.log(
          "📨 [RECEIVE] Has conversation for this friend?",
          prev.has(friendId),
        );

        // ⚠️ CRITICAL FIX: If we don't have conversation loaded yet,
        // DON'T create empty conversation! Just add this single message.
        // When user opens the chat, loadDirectMessages will load the full history.
        if (!prev.has(friendId)) {
          console.log("⚠️ [RECEIVE] Conversation not loaded yet!");
          console.log(
            "⚠️ [RECEIVE] Adding single message, full history will load when chat opens",
          );
        }

        // Check for duplicates
        const isDuplicate = currentMessages.some((m) => m.id === msg._id);
        if (!isDuplicate) {
          console.log("✅ [RECEIVE] Adding new incoming message");
          playMessageNotificationSound();
          const updated = [...currentMessages, uiMessage];
          newMap.set(friendId, updated);
          console.log("✅ [RECEIVE] Updated messages count:", updated.length);
        } else {
          console.log("⚠️ [RECEIVE] Duplicate message detected, skipping");
          newMap.set(friendId, currentMessages);
        }

        return newMap;
      });

      // Increment unread indicator when receiving message in a conversation we're not viewing
      if (selectedDirectMessageFriend?._id !== friendId) {
        setDmUnreadCounts((prev) => ({
          ...prev,
          [friendId]: (prev[friendId] ?? 0) + 1,
        }));
      }

      // Auto-scroll to bottom if viewing this conversation (instant for incoming messages)
      if (
        selectedDirectMessageFriend &&
        friendId === selectedDirectMessageFriend._id
      ) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTop =
                messagesContainerRef.current.scrollHeight;
            }
          });
        });
      }
    }
  }, [
    newMessage,
    selectedDirectMessageFriend,
    currentUserId,
    friends,
    loadAvailableUsers,
  ]);

  // ✅ Handle message-deleted event
  useEffect(() => {
    if (messageDeleted) {
      console.log("🗑️ [DELETE] Message deleted event received:", messageDeleted);
      
      // Remove message from all conversations
      setConversations((prev) => {
        const newMap = new Map(prev);
        
        // Iterate through all conversations
        for (const [friendId, messages] of newMap.entries()) {
          const updatedMessages = messages.filter(
            (msg) => msg.id !== messageDeleted.messageId
          );
          
          if (updatedMessages.length !== messages.length) {
            newMap.set(friendId, updatedMessages);
            console.log(
              `🗑️ [DELETE] Removed message from conversation with ${friendId}`
            );
          }
        }
        
        return newMap;
      });
    }
  }, [messageDeleted]);

  // Load messages when any text chat channel is selected (includes category "info"; textChannels state excludes info only for sidebar grouping)
  /** Đang chọn kênh thoại trong sidebar (hiển thị UI kênh thoại đầy đủ). */
  const viewingVoiceChannel = selectedChannel
    ? voiceChannels.find((c) => c._id === selectedChannel) ?? null
    : null;
  /** Kênh thoại đang có phiên LiveKit (có thể đang xem kênh chat). */
  const connectedVoiceChannel = joinedVoiceChannelId
    ? voiceChannels.find((c) => c._id === joinedVoiceChannelId) ?? null
    : null;
  const selectedChatTextChannel = selectedChannel
    ? allChannels.find((c) => c._id === selectedChannel && c.type === "text")
    : null;

  const voiceMuteKey =
    selectedServer && joinedVoiceChannelId ? `${selectedServer}:${joinedVoiceChannelId}` : null;

  // Khi đổi kênh thoại, phục hồi mute state theo kênh đó (không ảnh hưởng kênh khác)
  useEffect(() => {
    if (!voiceMuteKey) return;
    const v = voiceMuteByChannel[voiceMuteKey];
    setVoiceMicMuted(Boolean(v?.micMuted));
    setVoiceSoundMuted(Boolean(v?.soundMuted));
  }, [voiceMuteKey, voiceMuteByChannel]);

  useEffect(() => {
    if (selectedChannel && selectedChatTextChannel) {
      setReplyingTo(null);
      const prev = prevChannelRef.current;
      if (prev && prev !== selectedChannel) leaveChannel(prev);
      prevChannelRef.current = selectedChannel;
      joinChannel(selectedChannel);
      loadMessages(selectedChannel);
    }
  }, [selectedChannel, selectedChatTextChannel?._id, joinChannel, leaveChannel]);

  useEffect(() => {
    if (!selectedChannel && prevChannelRef.current) {
      leaveChannel(prevChannelRef.current);
      prevChannelRef.current = null;
    }
  }, [selectedChannel, leaveChannel]);

  useEffect(() => {
    if (isChannelSocketConnected && selectedChannel) joinChannel(selectedChannel);
  }, [isChannelSocketConnected, selectedChannel, joinChannel]);

  useEffect(() => {
    setJoinedVoiceChannelId(null);
    setVoiceChannelCallToken(null);
    setVoiceChannelCallServerUrl("");
    setVoiceChannelCallError(null);
  }, [selectedServer]);

  // Voice channel: auto-join LiveKit room when user is in a voice channel (no separate call button)
  useEffect(() => {
    if (!connectedVoiceChannel || !selectedServer || !token || !currentUserProfile) {
      setVoiceChannelCallToken(null);
      setVoiceChannelCallServerUrl("");
      setVoiceChannelCallError(null);
      return;
    }
    const roomName = `voice-${selectedServer}-${connectedVoiceChannel._id}`;
    const participantName =
      currentUserProfile.displayName || currentUserProfile.username || "Người dùng";

    let cancelled = false;
    setVoiceChannelCallError(null);
    getLiveKitToken(roomName, participantName, token)
      .then(({ token: livekitToken, url }) => {
        if (!cancelled) {
          setVoiceChannelCallToken(livekitToken);
          setVoiceChannelCallServerUrl(url);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setVoiceChannelCallToken(null);
          setVoiceChannelCallServerUrl("");
          setVoiceChannelCallError(
            err instanceof Error ? err.message : "Không thể kết nối kênh thoại",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [connectedVoiceChannel?._id, selectedServer, token, currentUserProfile?.username]);

  // Auto scroll to latest message - optimized to prevent jitter
  useEffect(() => {
    // Only auto-scroll if we should (not when user is scrolling up to read old messages)
    if (shouldAutoScrollRef.current && messages.length > 0) {
      // Double RAF to ensure DOM fully rendered
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop =
              messagesContainerRef.current.scrollHeight;
          }
        });
      });
    }
  }, [messages]);

  // Auto scroll for DM conversations when they change - INSTANT scroll
  useEffect(() => {
    if (selectedDirectMessageFriend) {
      const currentMessages = conversations.get(
        selectedDirectMessageFriend._id,
      );
      if (currentMessages && currentMessages.length > 0) {
        // Scroll IMMEDIATELY after render, no animation
        const scrollToBottom = () => {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop =
              messagesContainerRef.current.scrollHeight;
          }
        };

        // Execute immediately
        scrollToBottom();

        // And again after paint to ensure it sticks
        requestAnimationFrame(() => {
          scrollToBottom();
          requestAnimationFrame(scrollToBottom);
        });
      }
    }
  }, [conversations, selectedDirectMessageFriend]);


  const loadServers = async () => {
    try {
      setLoading(true);
      const serversList = await serversApi.getMyServers();
      // Organize channels by type for each server
      const serversWithChannels: BackendServer[] = await Promise.all(
        serversList.map(async (server) => {
          const channels = server.channels as serversApi.Channel[];
          const infoChannels = channels.filter(
            (c) => c.type === "text" && c.category === "info" && !c.categoryId,
          );
          const textChannels = channels.filter((c) => c.type === "text" && c.category !== "info");
          const voiceChannels = channels.filter((c) => c.type === "voice");
          return {
            ...server,
            infoChannels,
            textChannels,
            voiceChannels,
          };
        }),
      );

      setServers(serversWithChannels);
      // Don't auto-select server on load - let user choose
      setSelectedServer(null);
      setSelectedChannel(null);
      setError(null);
    } catch (err) {
      setError("Không tải được danh sách máy chủ");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadFriends = async () => {
    try {
      const friendsList = await serversApi.getMyFollowers();
      setFriends(friendsList);
    } catch (err) {
      console.error("Failed to load friends", err);
      // Set empty array if friends API is not available
      setFriends([]);
    }
  };

  const loadChannels = async (
    serverId: string,
    opts?: { keepSelectedChannel?: boolean; preferredChannelId?: string },
  ) => {
    try {
      let channels: serversApi.Channel[];
      let cats: serversApi.ServerCategory[];
      if (isAdminView && serverId === adminViewServerId) {
        const adminToken = localStorage.getItem("accessToken") || localStorage.getItem("token") || "";
        const view = await serversApi.adminGetServerView(serverId, adminToken);
        channels = view.channels || [];
        cats = view.categories || [];
      } else {
        [channels, cats] = await Promise.all([
          serversApi.getChannels(serverId),
          serversApi.getCategories(serverId).catch(() => [] as serversApi.ServerCategory[]),
        ]);
      }
      const sorted = (channels || []).sort(
        (a: serversApi.Channel, b: serversApi.Channel) => (a.position ?? 0) - (b.position ?? 0),
      );
      setAllChannels(sorted);
      const info = sorted.filter(
        (c: serversApi.Channel) => c.type === "text" && c.category === "info" && !c.categoryId,
      );
      const text = sorted.filter((c: serversApi.Channel) => c.type === "text" && c.category !== "info");
      const voice = sorted.filter((c: serversApi.Channel) => c.type === "voice");
      setInfoChannels(info);
      setTextChannels(text);
      setVoiceChannels(voice);
      setServerCategories(cats);
      if (opts?.preferredChannelId) {
        const preferred = sorted.find((c) => c._id === opts.preferredChannelId);
        if (preferred) {
          setSelectedChannel(preferred._id);
          return;
        }
      }
      if (opts?.keepSelectedChannel && selectedChannelRef.current) {
        const stillExists = sorted.some((c) => c._id === selectedChannelRef.current);
        if (stillExists) return;
      }
      if (text.length > 0) {
        setSelectedChannel(text[0]._id);
      } else if (info.length > 0) {
        setSelectedChannel(info[0]._id);
      } else {
        setSelectedChannel(null);
      }
    } catch (err) {
      console.error("Failed to load channels", err);
      setError("Không tải được danh sách kênh");
    }
  };

  const loadMessages = async (channelId: string) => {
    try {
      const requestKey = `${channelId}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
      (loadMessages as any)._lastKey = requestKey;
      let pack;
      if (isAdminView && selectedServer && selectedServer === adminViewServerId) {
        const adminToken = localStorage.getItem("accessToken") || localStorage.getItem("token") || "";
        pack = await serversApi.adminGetChannelMessages(selectedServer, channelId, adminToken, 50, 0);
      } else {
        pack = await serversApi.getMessages(channelId, 50, 0);
      }
      // Nếu trong lúc chờ user đã chuyển kênh, bỏ qua kết quả cũ để tránh "tin nhắn bị dính sang kênh khác".
      if ((loadMessages as any)._lastKey !== requestKey) return;
      if (selectedChannelRef.current !== channelId) return;

      if (!pack.chatViewBlocked) {
        serversApi.markChannelAsRead(channelId).catch(() => {});
      }

      const backendMessages = pack.messages;
      const nickByUserId = new Map<string, string>();
      const srv = selectedServer ? servers.find((s) => s._id === selectedServer) : null;
      (srv?.members || []).forEach((m: any) => {
        const n = typeof m?.nickname === "string" ? m.nickname.trim() : "";
        if (n) nickByUserId.set(String(m.userId), n);
      });
      const uiMessages: UIMessage[] = backendMessages.map((msg: serversApi.Message) => ({
        id: msg._id,
        text: msg.content,
        senderId:
          typeof msg.senderId === "string" ? msg.senderId : msg.senderId._id,
        senderEmail: typeof msg.senderId === "string" ? "" : (msg.senderId as any).email ?? "",
        senderName:
          typeof msg.senderId === "string"
            ? ""
            : (msg.senderId as any).username || (msg.senderId as any).email || "",
        senderDisplayName:
          typeof msg.senderId === "string"
            ? undefined
            : nickByUserId.get(String((msg.senderId as any)._id)) || (msg.senderId as any).displayName || undefined,
        serverNickname:
          typeof msg.senderId === "string"
            ? undefined
            : nickByUserId.get(String((msg.senderId as any)._id)) || undefined,
        senderAvatar:
          typeof msg.senderId === "string"
            ? undefined
            : (msg.senderId as any).avatarUrl || (msg.senderId as any).avatar,
        timestamp: new Date(msg.createdAt),
        isFromCurrentUser:
          (typeof msg.senderId === "string"
            ? msg.senderId
            : (msg.senderId as any)._id) === currentUserId,
        type: "server",
        messageType: (msg as any).messageType || "text",
        giphyId: (msg as any).giphyId || undefined,
        customStickerUrl: (msg as any).customStickerUrl || undefined,
        serverStickerId:
          (msg as any).serverStickerId != null
            ? String((msg as any).serverStickerId)
            : undefined,
        voiceUrl: (msg as any).voiceUrl ?? undefined,
        voiceDuration: (msg as any).voiceDuration ?? undefined,
        stickerReplyWelcomeEnabled: (msg as any).stickerReplyWelcomeEnabled,
        contentModerationResult: (msg as any).contentModerationResult ?? "none",
        reactions: normalizeReactions(msg.reactions),
        replyTo:
          msg.replyTo && typeof msg.replyTo === "object"
            ? msg.replyTo._id
            : typeof msg.replyTo === "string"
              ? msg.replyTo
              : undefined,
        replyToMessage: mapReplyToMessage(
          msg.replyTo && typeof msg.replyTo === "object" ? msg.replyTo : null,
        ),
      }));

      setMessages(sortServerMessagesAscending(uiMessages));
      setError(null);
    } catch (err) {
      console.error("Failed to load messages", err);
      setError("Không tải được tin nhắn");
    }
  };

  // Track which conversations are being loaded to prevent race conditions
  const loadingConversationsRef = useRef<Set<string>>(new Set());
  // Track which conversations have been fully loaded from API
  const fullyLoadedConversationsRef = useRef<Set<string>>(new Set());

  const loadDirectMessages = async (
    friendId: string,
    forceReload: boolean = false,
  ) => {
    console.log(
      "📥 [LOAD] Loading messages for friend:",
      friendId,
      "forceReload:",
      forceReload,
    );
    console.log(
      "📥 [LOAD] Current conversations:",
      Array.from(conversations.keys()),
    );
    console.log(
      "📥 [LOAD] Already has conversation?",
      conversations.has(friendId),
    );
    console.log(
      "📥 [LOAD] Fully loaded?",
      fullyLoadedConversationsRef.current.has(friendId),
    );
    console.log(
      "📥 [LOAD] Currently loading?",
      loadingConversationsRef.current.has(friendId),
    );

    // Check if we already have FULLY loaded messages for this conversation
    if (fullyLoadedConversationsRef.current.has(friendId) && !forceReload) {
      const existingMessages = conversations.get(friendId) || [];
      console.log(
        "📥 [LOAD] Conversation fully loaded from API, message count:",
        existingMessages.length,
      );
      return; // Already fully loaded from API
    }

    // If conversation exists but wasn't fully loaded (e.g., from WebSocket only)
    if (
      conversations.has(friendId) &&
      !fullyLoadedConversationsRef.current.has(friendId)
    ) {
      const existingMessages = conversations.get(friendId) || [];
      console.log("⚠️ [LOAD] Conversation exists but not fully loaded!");
      console.log("⚠️ [LOAD] Current message count:", existingMessages.length);
      console.log(
        "⚠️ [LOAD] This might be from WebSocket only, loading full history from API...",
      );
    }

    // Check if already loading this conversation
    if (loadingConversationsRef.current.has(friendId)) {
      console.log(
        "📥 [LOAD] Already loading this conversation, skipping duplicate request",
      );
      return;
    }

    try {
      loadingConversationsRef.current.add(friendId);
      setLoadingDirectMessages(true);
      console.log("📥 [LOAD] Fetching full message history from API...");
      const backendMessages = await getDirectMessages(friendId, {
        token,
        limit: 50,
      });
      console.log(
        "📥 [LOAD] Received messages from API:",
        backendMessages.length,
      );

      const uiMessages: UIMessage[] = backendMessages.map((msg: any) => ({
        id: msg._id,
        text: msg.content,
        senderId: msg.senderId._id,
        senderEmail: msg.senderId.email,
        senderDisplayName: msg.senderId.displayName || undefined,
        senderName: msg.senderId.username || msg.senderId.email,
        senderAvatar: msg.senderId.avatar,
        timestamp: new Date(msg.createdAt),
        isFromCurrentUser: msg.senderId._id === currentUserId,
        type: "direct", // Phân biệt là message từ direct message
        isRead: msg.isRead || false, // Load initial read status
        messageType: msg.type || "text", // Type of message content
        giphyId: msg.giphyId || undefined, // Giphy ID if it's a GIF/sticker
        customStickerUrl: msg.customStickerUrl || undefined,
        serverStickerId:
          msg.serverStickerId != null ? String(msg.serverStickerId) : undefined,
        voiceUrl: msg.voiceUrl ?? undefined, // Voice message URL
        voiceDuration: msg.voiceDuration ?? undefined, // Voice message duration
        reactions: normalizeReactions(msg.reactions),
        replyTo: msg.replyTo?._id || undefined,
        replyToMessage: mapReplyToMessage(msg.replyTo),
      }));

      console.log(
        "📥 [LOAD] Setting conversation with",
        uiMessages.length,
        "messages from API",
      );
      setConversations((prev) => {
        const newMap = new Map(prev);
        const existingMessages = newMap.get(friendId) || [];

        // ✅ CRITICAL FIX: Always replace with API data (full history)
        // But merge any very recent messages that might have arrived via WebSocket
        console.log(
          "📥 [LOAD] Merging API messages with existing WebSocket messages",
        );
        console.log("📥 [LOAD] API messages:", uiMessages.length);
        console.log("📥 [LOAD] Existing messages:", existingMessages.length);

        // Create a map of API messages by ID for quick lookup
        const apiMessageIds = new Set(uiMessages.map((m) => m.id));

        // Find WebSocket messages that aren't in API response (very recent)
        const recentWebSocketMessages = existingMessages.filter(
          (m) => !apiMessageIds.has(m.id),
        );
        console.log(
          "📥 [LOAD] Recent WebSocket-only messages:",
          recentWebSocketMessages.length,
        );

        // Merge: API messages + recent WebSocket messages
        const mergedMessages = [...uiMessages, ...recentWebSocketMessages];
        console.log(
          "📥 [LOAD] Final merged message count:",
          mergedMessages.length,
        );

        newMap.set(friendId, mergedMessages);
        return newMap;
      });

      // Mark as fully loaded
      fullyLoadedConversationsRef.current.add(friendId);
      console.log("✅ [LOAD] Marked conversation as fully loaded from API");

      setError(null);
    } catch (err) {
      console.error("❌ [LOAD] Failed to load direct messages:", err);
      setError("Không tải được tin nhắn trực tiếp");
      setConversations((prev) => {
        const newMap = new Map(prev);
        if (!newMap.has(friendId)) {
          newMap.set(friendId, []);
        }
        return newMap;
      });
    } finally {
      loadingConversationsRef.current.delete(friendId);
      setLoadingDirectMessages(false);
    }
  };

  const handleSelectDirectMessageFriend = async (friend: serversApi.Friend) => {
    setJoinedVoiceChannelId(null);
    setVoiceChannelCallToken(null);
    setVoiceChannelCallServerUrl("");
    setShowExploreView(false);
    setSelectedDirectMessageFriend(friend);
    setMessageText("");
    setSelectedServer(null);
    setSelectedChannel(null);
    setDmUnreadCounts((prev) => ({ ...prev, [friend._id]: 0 })); // Clear unread indicator when opening chat
    // Ensure backend read-state is updated immediately when opening the conversation
    try {
      // Fire socket for realtime (fast)
      markAllAsRead?.(friend._id);
      // Also call REST to avoid race with getConversationList refresh
      if (token) await markDmConversationRead({ token, userId: friend._id });
    } catch (_err) {}
    shouldAutoScrollRef.current = true; // ✅ Enable auto-scroll when switching conversations
    // Pre-scroll to bottom BEFORE loading (prevents visual jump)
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = 0; // Reset first
    }
    await loadDirectMessages(friend._id);
  };

  const handleOpenChannelUserProfile = useCallback(
    (message: UIMessage, anchorRect: DOMRect) => {
      if (!selectedServer) return;
      const srv = servers.find((s) => s._id === selectedServer);
      if (!srv) return;
      setChannelProfileContext({
        anchorRect,
        serverId: selectedServer,
        serverName: srv.name || "Máy chủ",
        serverAvatarUrl: srv.avatarUrl ?? null,
        targetUserId: message.senderId,
        nicknameInChannel: message.serverNickname ?? null,
        fallbackDisplayName:
          message.senderDisplayName ||
          message.senderName ||
          message.senderEmail ||
          "Người dùng",
        fallbackUsername: message.senderName || message.senderEmail || "",
        fallbackAvatarUrl: message.senderAvatar,
      });
    },
    [selectedServer, servers],
  );

  const handleOpenDmFromChannelProfile = useCallback(
    (friend: serversApi.Friend, opts?: { openGifPicker?: boolean }) => {
      setChannelProfileContext(null);
      setSelectedServer(null);
      setSelectedChannel(null);
      setSelectedDirectMessageFriend(friend);
      void loadDirectMessages(friend._id);
      if (opts?.openGifPicker) {
        setMediaPickerTab("gif");
        setShowGiphyPicker(true);
      }
    },
    [loadDirectMessages],
  );

  const channelProfileInviteServers = useMemo(() => {
    const sid = channelProfileContext?.serverId;
    return servers
      .filter((s) => (sid ? s._id !== sid : true))
      .map((s) => ({
        _id: s._id,
        name: s.name || "Máy chủ",
        avatarUrl: s.avatarUrl ?? null,
      }));
  }, [servers, channelProfileContext?.serverId]);

  // Handler for adding/removing reactions (DM and channel)
  const applyReactionUpdate = (
    msg: UIMessage,
    messageId: string,
    emoji: string,
  ): UIMessage => {
    if (msg.id !== messageId) return msg;
    const reactions = msg.reactions || [];
    const existingReaction = reactions.find(
      (r) => r.userIds.includes(currentUserId) && r.emoji === emoji,
    );
    if (existingReaction) {
      return {
        ...msg,
        reactions: reactions
          .map((r) => ({
            ...r,
            userIds: r.userIds.filter((id) => id !== currentUserId),
            count: r.count - 1,
          }))
          .filter((r) => r.count > 0),
      };
    }
    const emojiReaction = reactions.find((r) => r.emoji === emoji);
    if (emojiReaction) {
      return {
        ...msg,
        reactions: reactions.map((r) =>
          r.emoji === emoji
            ? {
                ...r,
                userIds: [...r.userIds, currentUserId],
                count: r.count + 1,
              }
            : r,
        ),
      };
    }
    return {
      ...msg,
      reactions: [...reactions, { emoji, userIds: [currentUserId], count: 1 }],
    };
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    try {
      if (selectedDirectMessageFriend) {
        const friendId = selectedDirectMessageFriend._id;
        setConversations((prev) => {
          const newMap = new Map(prev);
          const currentMessages = newMap.get(friendId) || [];
          const updatedMessages = currentMessages.map((msg) =>
            applyReactionUpdate(msg, messageId, emoji),
          );
          newMap.set(friendId, updatedMessages);
          return newMap;
        });
        const updatedFromServer = await addMessageReaction(messageId, emoji, { token });
        if (updatedFromServer?.reactions) {
          setConversations((prev) => {
            const newMap = new Map(prev);
            const list = newMap.get(friendId) || [];
            const idx = list.findIndex((m) => m.id === messageId);
            if (idx === -1) return newMap;
            const next = [...list];
            next[idx] = {
              ...next[idx],
              reactions: normalizeReactions(updatedFromServer.reactions),
            };
            newMap.set(friendId, next);
            return newMap;
          });
        }
        return;
      }

      if (selectedChannel) {
        setMessages((prev) =>
          prev.map((msg) => applyReactionUpdate(msg, messageId, emoji)),
        );
        const updatedFromServer = await serversApi.addMessageReaction(
          selectedChannel,
          messageId,
          emoji,
        );
        if (updatedFromServer?.reactions) {
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === messageId);
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = {
              ...next[idx],
              reactions: normalizeReactions(updatedFromServer.reactions),
            };
            return next;
          });
        }
      }
    } catch (error) {
      console.error("Failed to add reaction:", error);
    }
  };

  // Handler for pinning messages
  const handlePinMessage = async (messageId: string) => {
    try {
      await pinDirectMessage(messageId, { token });

      // Update local state
      if (selectedDirectMessageFriend) {
        const friendId = selectedDirectMessageFriend._id;
        const currentMessages = conversations.get(friendId) || [];
        const updatedMessages = currentMessages.map((msg) =>
          msg.id === messageId ? { ...msg, isPinned: !msg.isPinned } : msg
        );
        setConversations(new Map(conversations.set(friendId, updatedMessages)));
      }

      // Socket will be notified via backend gateway
    } catch (error) {
      console.error("Failed to pin message:", error);
    }
  };

  // Handler for reporting messages
  const handleReportMessage = async (
    messageId: string,
    reason: string,
    description?: string
  ) => {
    try {
      await reportDirectMessage(messageId, reason, description, { token });
      alert(t("chat.messagesPage.reportDone"));
      setShowReportDialog(null);

      // Socket will be notified via backend gateway
    } catch (error: any) {
      console.error("Failed to report message:", error);
      alert(error?.message || "Không thể báo cáo tin nhắn");
    }
  };

  // Handler for deleting messages
  const handleDeleteMessage = async (
    messageId: string,
    deleteType: "for-everyone" | "for-me"
  ) => {
    try {
      const result = await deleteDirectMessage(messageId, deleteType, { token });

      // Update local state
      if (selectedDirectMessageFriend) {
        const friendId = selectedDirectMessageFriend._id;
        const currentMessages = conversations.get(friendId) || [];
        const updatedMessages = currentMessages.filter(
          (msg) => msg.id !== messageId
        );
        setConversations(new Map(conversations.set(friendId, updatedMessages)));

        // Emit socket event to notify receiver (for real-time update)
        if (emitDeleteMessage) {
          emitDeleteMessage(messageId, deleteType, friendId);
        }
      }

      // Show success toast
      if (deleteType === "for-everyone") {
        setToastMessage("Đã thu hồi tin nhắn với mọi người");
      } else {
        setToastMessage("Bạn đã xóa một tin nhắn");
      }

      // Hide toast after 3 seconds
      setTimeout(() => setToastMessage(null), 3000);

      // Close dialog
      setShowDeleteDialog(null);
    } catch (error) {
      console.error("Failed to delete message:", error);
      alert("Không thể gỡ tin nhắn");
    }
  };

  // Handler for replying to a message
  const handleReplyToMessage = (message: UIMessage) => {
    setReplyingTo(message);
  };

  const shouldBlockServerChatInput = Boolean(
    selectedServer &&
      !selectedDirectMessageFriend &&
      (myServerAccessStatus?.chatViewBlocked === true ||
        (myServerAccessStatus?.hasRules === true &&
          !myServerAccessStatus?.acceptedRules)),
  );

  useEffect(() => {
    if (!shouldBlockServerChatInput) return;
    setMentionOpen(false);
    setShowPlusMenu(false);
    setShowGiphyPicker(false);
  }, [shouldBlockServerChatInput]);

  const handleSendMessage = async () => {
    if (shouldBlockServerChatInput) {
      void openVerificationRulesModal();
      return;
    }
    if (!messageText.trim() || !selectedChannel) return;

    const content = messageText.trim();

    try {
      setMessageText("");
      setMentionOpen(false);
      setMentionKeyword("");
      setMentionStartPos(-1);
      shouldAutoScrollRef.current = true;

      const newMessage = await serversApi.createMessage(
        selectedChannel,
        content,
        undefined,
        replyingTo?.id,
      );

      const myServerNickname =
        servers
          .find((s) => s._id === selectedServer)
          ?.members?.find((m) => String(m.userId) === String(currentUserId))
          ?.nickname?.trim() ?? "";
      const senderDisplayNameResolved =
        myServerNickname ||
        (typeof newMessage.senderId === "string"
          ? currentUserProfile?.displayName
          : ((newMessage.senderId as any)?.displayName ?? currentUserProfile?.displayName)) ||
        undefined;

      const uiMessage: UIMessage = {
        id: newMessage._id,
        text: newMessage.content,
        senderId:
          typeof newMessage.senderId === "string"
            ? newMessage.senderId
            : (newMessage.senderId as any)?._id,
        senderEmail:
          typeof newMessage.senderId === "string"
            ? ""
            : (newMessage.senderId as any)?.email ?? "",
        senderName:
          typeof newMessage.senderId === "string"
            ? currentUserProfile?.username || ""
            : (newMessage.senderId as any)?.username || (newMessage.senderId as any)?.email || currentUserProfile?.username || "",
        senderDisplayName: senderDisplayNameResolved,
        senderAvatar:
          typeof newMessage.senderId === "string"
            ? currentUserProfile?.avatar
            : (newMessage.senderId as any)?.avatarUrl ?? (newMessage.senderId as any)?.avatar ?? currentUserProfile?.avatar,
        timestamp: new Date(newMessage.createdAt),
        isFromCurrentUser: true,
        type: "server",
        messageType: (newMessage as any).messageType || "text",
        giphyId: (newMessage as any).giphyId || undefined,
        customStickerUrl: (newMessage as any).customStickerUrl || undefined,
        serverStickerId:
          (newMessage as any).serverStickerId != null
            ? String((newMessage as any).serverStickerId)
            : undefined,
        voiceUrl: (newMessage as any).voiceUrl ?? undefined,
        voiceDuration: (newMessage as any).voiceDuration ?? undefined,
        replyTo: replyingTo?.id ?? (newMessage.replyTo && typeof newMessage.replyTo === "object" ? (newMessage.replyTo as any)._id : typeof newMessage.replyTo === "string" ? newMessage.replyTo : undefined),
        replyToMessage:
          mapReplyToMessage(
            newMessage.replyTo && typeof newMessage.replyTo === "object" ? newMessage.replyTo : null,
          ) ?? (replyingTo
            ? {
                id: replyingTo.id,
                senderId: replyingTo.senderId,
                senderDisplayName: replyingTo.senderDisplayName,
                senderName: replyingTo.senderName,
                messageType: replyingTo.messageType ?? "text",
                text: replyingTo.text,
              }
            : null),
        reactions: normalizeReactions((newMessage as any).reactions),
      };

      setMessages((prev) => appendServerMessage(prev, uiMessage));
      setReplyingTo(null);
      serversApi.markChannelAsRead(selectedChannel).catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không gửi được tin nhắn";
      const isSpamBlock =
        msg.includes("spam đề cập") ||
        msg.includes("chặn đề cập") ||
        msg.includes("hạn chế gửi tin nhắn");
      setError(msg);
      if (!isSpamBlock) setMessageText(content);
      setTimeout(() => setError((prev) => (prev === msg ? null : prev)), 5000);
    }
  };

  const handleAcceptServerRules = async () => {
    if (!selectedServer) return;
    setAcceptRulesLoading(true);
    setError(null);
    try {
      await serversApi.acceptServerRules(selectedServer);
      const status = await serversApi.getMyServerAccessStatus(selectedServer);
      setMyServerAccessStatus(status);
      setShowAcceptRulesModal(false);
      const ch = selectedChannelRef.current;
      if (ch) await loadMessages(ch);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể chấp nhận quy định");
    } finally {
      setAcceptRulesLoading(false);
    }
  };

  const openVerificationRulesModal = async () => {
    if (!selectedServer) return;
    setVerificationRulesAgreed(false);
    try {
      const s = await serversApi.getServerAccessSettings(selectedServer);
      setVerificationAccessSettings(s);
      setVerificationRulesOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được quy định");
    }
  };

  // Apply-to-join: show join application popup before calling joinServer
  const [applyJoinOpen, setApplyJoinOpen] = useState(false);
  const [applyJoinServerId, setApplyJoinServerId] = useState<string | null>(null);
  const [applyJoinForm, setApplyJoinForm] = useState<{ enabled: boolean; questions: Array<{ id: string; title: string; type: "short" | "paragraph" | "multiple_choice"; required: boolean; options?: string[] }> } | null>(null);
  const [applyJoinSubmitting, setApplyJoinSubmitting] = useState(false);

  const openApplyJoinModalIfNeeded = async (serverId: string): Promise<boolean> => {
    try {
      const settings = await serversApi.getServerAccessSettings(serverId);
      if (settings.accessMode !== "apply") return false;
      const form = settings.joinApplicationForm ?? { enabled: false, questions: [] };
      setApplyJoinServerId(serverId);
      setApplyJoinForm({
        enabled: Boolean(form.enabled),
        questions: form.questions ?? [],
      });
      setApplyJoinOpen(true);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được đơn đăng ký tham gia");
      return false;
    }
  };

  const submitApplyJoin = async (applyJoinAnswers: Record<string, { text?: string; selectedOption?: string }>) => {
    if (!applyJoinServerId || !applyJoinForm) return;

    for (const q of applyJoinForm.questions) {
      if (!q.required) continue;
      const a = applyJoinAnswers[q.id];
      if (q.type === "multiple_choice") {
        if (!a?.selectedOption) {
          setError("Vui lòng trả lời tất cả câu hỏi bắt buộc");
          return;
        }
      } else if (!a?.text?.trim()) {
        setError("Vui lòng trả lời tất cả câu hỏi bắt buộc");
        return;
      }
    }

    setApplyJoinSubmitting(true);
    setError(null);
    try {
      await serversApi.joinServer(applyJoinServerId, {
        applicationAnswers: applyJoinForm.questions.map((q) => {
          const a = applyJoinAnswers[q.id] || {};
          return {
            questionId: q.id,
            text: q.type === "multiple_choice" ? undefined : (a.text ?? ""),
            selectedOption: q.type === "multiple_choice" ? a.selectedOption : undefined,
          };
        }),
      });
      setApplyJoinOpen(false);
      setApplyJoinServerId(null);
      setApplyJoinForm(null);
      alert("Đơn đăng ký đã được gửi thành công. Vui lòng chờ chủ máy chủ hoặc quản trị viên duyệt đơn.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tham gia được máy chủ");
    } finally {
      setApplyJoinSubmitting(false);
    }
  };

  const submitVerificationRulesModal = async () => {
    if (!selectedServer) return;
    const needsAgree = verificationAccessSettings?.hasRules && (verificationAccessSettings?.rules?.length ?? 0) > 0;
    if (needsAgree && !verificationRulesAgreed) return;
    setVerificationRulesSubmitting(true);
    setError(null);
    try {
      if (needsAgree && !myServerAccessStatus?.acceptedRules) {
        await serversApi.acceptServerRules(selectedServer);
      }
      const status = await serversApi.getMyServerAccessStatus(selectedServer);
      setMyServerAccessStatus(status);
      const stillBlocked =
        status.chatViewBlocked ||
        (status.hasRules && !status.acceptedRules);
      if (!stillBlocked) {
        setVerificationRulesOpen(false);
        setVerificationAccessSettings(null);
        setShowAcceptRulesModal(false);
        const ch = selectedChannelRef.current;
        if (ch) await loadMessages(ch);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không hoàn thành được");
    } finally {
      setVerificationRulesSubmitting(false);
    }
  };

  const handleAgeAcknowledgeContinue = async () => {
    if (!selectedServer) return;
    setAgeAcknowledgeLoading(true);
    setError(null);
    try {
      await serversApi.acknowledgeServerAgeRestriction(selectedServer);
      const status = await serversApi.getMyServerAccessStatus(selectedServer);
      setMyServerAccessStatus(status);
      if (status.hasRules && !status.acceptedRules && !status.chatViewBlocked) {
        try {
          const s = await serversApi.getServerAccessSettings(selectedServer);
          setVerificationAccessSettings(s);
          setVerificationRulesAgreed(false);
        } catch { /* ignore */ }
        setShowAcceptRulesModal(true);
      }
      const ch = selectedChannelRef.current;
      if (ch) await loadMessages(ch);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xác nhận được");
    } finally {
      setAgeAcknowledgeLoading(false);
    }
  };

  const handleSendDirectMessage = async () => {
    if (!messageText.trim() || !selectedDirectMessageFriend) return;

    const messageContent = messageText.trim();
    const friendId = selectedDirectMessageFriend._id;
    let optimisticMessage: UIMessage | null = null;

    try {
      // ✅ Stop typing indicator immediately
      if (isTypingRef.current && notifyTyping) {
        isTypingRef.current = false;
        notifyTyping(friendId, false);
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
      }

      // Clear input immediately for better UX
      setMessageText("");

      // ✅ FIX: Create optimistic message
      optimisticMessage = {
        id: `temp-${Date.now()}-${Math.random()}`, // Unique temporary ID
        text: messageContent,
        senderId: currentUserId,
        senderEmail: "",
        senderDisplayName: currentUserProfile?.displayName || undefined,
        senderName: currentUserProfile?.username || "",
        senderAvatar: currentUserProfile?.avatar,
        timestamp: new Date(),
        isFromCurrentUser: true,
        type: "direct",
        isRead: false, // Not read yet
        messageType: "text",
        replyTo: replyingTo?.id,
        replyToMessage: replyingTo
          ? {
              id: replyingTo.id,
              senderId: replyingTo.senderId,
              senderDisplayName: replyingTo.senderDisplayName,
              senderName: replyingTo.senderName,
              messageType: replyingTo.messageType,
              text: replyingTo.text,
            }
          : null,
      };

      // ✅ Enable auto-scroll for new message
      shouldAutoScrollRef.current = true;

      // ✅ OPTIMISTIC UPDATE: thêm tin nhắn vào conversation ngay để hiển thị không cần reload
      setConversations((prev) => {
        const newMap = new Map(prev);
        const currentMessages = newMap.get(friendId) || [];
        newMap.set(friendId, [...currentMessages, optimisticMessage!]);
        return newMap;
      });

      // Gửi qua API (REST); response trả về tin nhắn đã tạo — dùng để thay temp bằng bản thật
      const created = await sendDirectMessage(friendId, {
        token,
        content: messageContent,
        replyTo: replyingTo?.id,
      });

      if (created && created._id) {
        const serverMessage: UIMessage = {
          id: created._id,
          text: created.content,
          senderId: typeof created.senderId === "string" ? created.senderId : created.senderId?._id,
          senderEmail: typeof created.senderId === "object" ? created.senderId?.email : "",
          senderDisplayName: typeof created.senderId === "object" ? (created.senderId?.displayName || undefined) : undefined,
          senderName: typeof created.senderId === "object" ? (created.senderId?.username || created.senderId?.email) : "",
          senderAvatar: typeof created.senderId === "object" ? created.senderId?.avatar : currentUserProfile?.avatar,
          timestamp: new Date(created.createdAt),
          isFromCurrentUser: true,
          type: "direct",
          isRead: created.isRead ?? false,
          messageType: created.type || "text",
          giphyId: created.giphyId ?? undefined,
          customStickerUrl: (created as any).customStickerUrl ?? undefined,
          serverStickerId:
            (created as any).serverStickerId != null
              ? String((created as any).serverStickerId)
              : undefined,
          voiceUrl: created.voiceUrl ?? undefined,
          voiceDuration: created.voiceDuration ?? undefined,
          replyTo:
            (created.replyTo?._id as any) ||
            (typeof created.replyTo === "string" ? created.replyTo : undefined) ||
            replyingTo?.id,
          replyToMessage:
            mapReplyToMessage(created.replyTo) ||
            (replyingTo
              ? {
                  id: replyingTo.id,
                  senderId: replyingTo.senderId,
                  senderDisplayName: replyingTo.senderDisplayName,
                  senderName: replyingTo.senderName,
                  messageType: replyingTo.messageType,
                  text: replyingTo.text,
                }
              : null),
          reactions: normalizeReactions(created.reactions),
        };
        setConversations((prev) => {
          const newMap = new Map(prev);
          const list = newMap.get(friendId) || [];
          const idx = optimisticMessage ? list.findIndex((m) => m.id === optimisticMessage!.id) : -1;
          const next = idx >= 0 ? [...list.slice(0, idx), serverMessage, ...list.slice(idx + 1)] : [...list, serverMessage];
          newMap.set(friendId, next);
          return newMap;
        });
      }

      setReplyingTo(null);
    } catch (err) {
      console.error("Failed to send direct message", err);
      setError("Không gửi được tin nhắn trực tiếp");
      // Khôi phục tin nhắn đã gửi vào input và gỡ optimistic message
      setMessageText(messageContent);
      if (!optimisticMessage) return;
      setConversations((prev) => {
        const newMap = new Map(prev);
        const list = newMap.get(friendId) || [];
        const next = list.filter((m) => m.id !== optimisticMessage!.id);
        newMap.set(friendId, next);
        return newMap;
      });
    }
  };

  const handleSendGiphy = async (gif: GiphyGif, type: "gif" | "sticker") => {
    if (selectedChannel && !selectedDirectMessageFriend) {
      try {
        shouldAutoScrollRef.current = true;
        const newMsg = await serversApi.createMessage(
          selectedChannel,
          gif.title || `Sent a ${type}`,
          undefined,
          replyingTo?.id,
          undefined,
          type,
          gif.id,
        );

        const uiMsg: UIMessage = {
          id: newMsg._id,
          text: newMsg.content,
          senderId: typeof newMsg.senderId === "string" ? newMsg.senderId : newMsg.senderId._id,
          senderEmail: "",
          senderName: currentUserProfile?.username || "",
          senderDisplayName:
            servers
              .find((s) => s._id === selectedServer)
              ?.members?.find((m) => String(m.userId) === String(currentUserId))
              ?.nickname?.trim() ||
            currentUserProfile?.displayName ||
            undefined,
          senderAvatar: currentUserProfile?.avatar,
          timestamp: new Date(newMsg.createdAt),
          isFromCurrentUser: true,
          type: "server",
          messageType: type,
          giphyId: gif.id,
          replyTo: replyingTo?.id,
          reactions: [],
        };
        setMessages((prev) => appendServerMessage(prev, uiMsg));
        setReplyingTo(null);
      } catch (err) {
        console.error(`Failed to send ${type}:`, err);
        setError(`Không gửi được ${type}`);
      }
      return;
    }

    if (!selectedDirectMessageFriend) return;
    const friendId = selectedDirectMessageFriend._id;

    try {
      const optimisticMessage: UIMessage = {
        id: `temp-${Date.now()}-${Math.random()}`,
        text: gif.title || `Sent a ${type}`,
        senderId: currentUserId,
        senderEmail: "",
        senderDisplayName: currentUserProfile?.displayName || undefined,
        senderName: currentUserProfile?.username || "",
        senderAvatar: currentUserProfile?.avatar,
        timestamp: new Date(),
        isFromCurrentUser: true,
        type: "direct",
        isRead: false,
        messageType: type,
        giphyId: gif.id,
      };

      shouldAutoScrollRef.current = true;

      setConversations((prev) => {
        const newMap = new Map(prev);
        const currentMessages = newMap.get(friendId) || [];
        newMap.set(friendId, [...currentMessages, optimisticMessage]);
        return newMap;
      });

      await sendDirectMessage(friendId, {
        token,
        content: gif.title || `Sent a ${type}`,
        type,
        giphyId: gif.id,
        replyTo: replyingTo?.id,
      });

      setReplyingTo(null);
    } catch (err) {
      console.error(`Failed to send ${type}:`, err);
      setError(`Không gửi được ${type}`);
    }
  };

  const handleSendServerSticker = async (
    sel: Extract<GiphyPickerSelection, { source: "server" }>,
  ) => {
    if (!selectedChannel || selectedDirectMessageFriend) {
      setError("Sticker máy chủ chỉ dùng trong kênh máy chủ.");
      return;
    }
    try {
      shouldAutoScrollRef.current = true;
      const label = sel.name?.trim() ? `:${sel.name}:` : "Sticker máy chủ";
      const newMsg = await serversApi.createMessage(
        selectedChannel,
        label,
        undefined,
        replyingTo?.id,
        undefined,
        "sticker",
        undefined,
        undefined,
        undefined,
        {
          customStickerUrl: sel.imageUrl,
          serverStickerId: sel.stickerId,
          serverStickerServerId: sel.serverId,
        },
      );
      const rawStickerId = (newMsg as serversApi.Message).serverStickerId;
      const serverStickerIdResolved: string =
        rawStickerId != null && String(rawStickerId).length > 0
          ? String(rawStickerId)
          : sel.stickerId;
      const uiMsg: UIMessage = {
        id: newMsg._id,
        text: newMsg.content,
        senderId:
          typeof newMsg.senderId === "string"
            ? newMsg.senderId
            : newMsg.senderId._id,
        senderEmail: "",
        senderName: currentUserProfile?.username || "",
        senderDisplayName:
          servers
            .find((s) => s._id === selectedServer)
            ?.members?.find((m) => String(m.userId) === String(currentUserId))
            ?.nickname?.trim() ||
          currentUserProfile?.displayName ||
          undefined,
        senderAvatar: currentUserProfile?.avatar,
        timestamp: new Date(newMsg.createdAt),
        isFromCurrentUser: true,
        type: "server",
        messageType: "sticker",
        customStickerUrl: (() => {
          const fromApi = (newMsg as serversApi.Message).customStickerUrl;
          return typeof fromApi === "string" && fromApi.length > 0
            ? fromApi
            : sel.imageUrl;
        })(),
        serverStickerId: serverStickerIdResolved,
        replyTo: replyingTo?.id ?? undefined,
        reactions: [],
      };
      setMessages((prev) => appendServerMessage(prev, uiMsg));
      setReplyingTo(null);
    } catch (err) {
      console.error("Failed to send server sticker:", err);
      setError("Không gửi được sticker máy chủ");
    }
  };

  const handleGiphyPickerSelect = (sel: GiphyPickerSelection) => {
    setShowGiphyPicker(false);
    if (sel.source === "giphy") {
      void handleSendGiphy(sel.gif, sel.mediaType);
      return;
    }
    if (sel.source === "server") {
      void handleSendServerSticker(sel);
      return;
    }
    if (sel.source === "unicode") {
      setMessageText((p) => p + sel.emoji);
      return;
    }
    if (sel.source === "kaomoji") {
      setMessageText((p) => p + sel.text);
      return;
    }
    if (sel.source === "serverEmoji") {
      const safe = sel.name.replace(/[^a-zA-Z0-9_]/g, "") || "emoji";
      const key = safe.toLowerCase();
      setMessageText((p) => p + `:${safe}:`);
      setServerEmojiRenderMap((prev) => ({
        ...prev,
        [key]: sel.imageUrl,
      }));
    }
  };

  // Handle voice recording complete
  const handleVoiceRecordComplete = async (
    audioBlob: Blob,
    duration: number,
    metadata?: { mimeType: string; fileExtension: string },
  ) => {
    const isServerChannel = !selectedDirectMessageFriend && selectedChannel && selectedServer;

    if (isServerChannel) {
      try {
        setIsRecordingVoice(false);
        setIsUploadingVoice(true);

        const fileName = metadata?.fileExtension
          ? `voice-message.${metadata.fileExtension}`
          : "voice-message.m4a";
        const mimeType = metadata?.mimeType || "audio/mp4";
        const audioFile = new File([audioBlob], fileName, { type: mimeType });

        if (audioFile.size > maxUploadBytes) {
          setError(
            `File quá lớn. Tối đa ${(maxUploadBytes / 1024 / 1024).toFixed(0)}MB`,
          );
          setIsUploadingVoice(false);
          return;
        }

        const uploadResponse = await uploadMedia({
          token,
          file: audioFile,
          cordigramUploadContext: "messages",
        });
        if (!uploadResponse || (!uploadResponse.secureUrl && !uploadResponse.url)) {
          throw new Error("Failed to upload voice message");
        }
        const voiceUrl = uploadResponse.secureUrl || uploadResponse.url;

        const newMessage = await serversApi.createMessage(
          selectedChannel!,
          "Tin nhắn thoại",
          undefined,
          replyingTo?.id,
          undefined,
          "voice",
          undefined,
          voiceUrl,
          duration,
        );

        const uiMessage: UIMessage = {
          id: newMessage._id,
          text: newMessage.content,
          senderId: typeof newMessage.senderId === "string" ? newMessage.senderId : (newMessage.senderId as any)?._id,
          senderEmail: typeof newMessage.senderId === "string" ? "" : (newMessage.senderId as any)?.email ?? "",
          senderName: typeof newMessage.senderId === "string" ? currentUserProfile?.username || "" : (newMessage.senderId as any)?.username || "",
          senderDisplayName: typeof newMessage.senderId === "string" ? currentUserProfile?.displayName || undefined : (newMessage.senderId as any)?.displayName ?? undefined,
          senderAvatar: typeof newMessage.senderId === "string" ? currentUserProfile?.avatar : (newMessage.senderId as any)?.avatarUrl ?? (newMessage.senderId as any)?.avatar ?? currentUserProfile?.avatar,
          timestamp: new Date(newMessage.createdAt),
          isFromCurrentUser: true,
          type: "server",
          messageType: "voice",
          voiceUrl: (newMessage as any).voiceUrl ?? voiceUrl,
          voiceDuration: (newMessage as any).voiceDuration ?? duration,
        };

        shouldAutoScrollRef.current = true;
        setMessages((prev) => appendServerMessage(prev, uiMessage));
        setReplyingTo(null);
        setIsUploadingVoice(false);
      } catch (err) {
        console.error("Failed to send voice message:", err);
        setError("Không gửi được tin nhắn thoại");
        setIsUploadingVoice(false);
        setIsRecordingVoice(false);
      }
      return;
    }

    if (!selectedDirectMessageFriend) return;

    const friendId = selectedDirectMessageFriend._id;

    try {
      console.log("🎤 [VOICE-UPLOAD] Starting upload, duration:", duration);
      console.log("🎤 [VOICE-UPLOAD] Metadata:", metadata);
      setIsRecordingVoice(false);
      setIsUploadingVoice(true);

      const fileName = metadata?.fileExtension 
        ? `voice-message.${metadata.fileExtension}`
        : "voice-message.m4a";
      const mimeType = metadata?.mimeType || "audio/mp4";
      
      const audioFile = new File([audioBlob], fileName, {
        type: mimeType,
      });

      if (audioFile.size > maxUploadBytes) {
        setError(
          `File quá lớn. Tối đa ${(maxUploadBytes / 1024 / 1024).toFixed(0)}MB`,
        );
        setIsUploadingVoice(false);
        return;
      }
      console.log("🎤 [VOICE-UPLOAD] Audio file created:", {
        name: audioFile.name,
        type: audioFile.type,
        size: audioFile.size,
      });

      console.log("🎤 [VOICE-UPLOAD] Uploading to Cloudinary...");
      const uploadResponse = await uploadMedia({
        token,
        file: audioFile,
        cordigramUploadContext: "messages",
      });
      console.log("🎤 [VOICE-UPLOAD] Upload response:", uploadResponse);

      if (!uploadResponse || (!uploadResponse.secureUrl && !uploadResponse.url)) {
        throw new Error("Failed to upload voice message");
      }

      // Prefer secureUrl (https) over url (http) to avoid mixed content issues
      const voiceUrl = uploadResponse.secureUrl || uploadResponse.url;
      console.log("✅ [VOICE-UPLOAD] Upload successful, URL:", voiceUrl);

      // Create optimistic message with transformed URL
      const optimisticMessage: UIMessage = {
        id: `temp-${Date.now()}-${Math.random()}`,
        text: "Tin nhắn thoại",
        senderId: currentUserId,
        senderEmail: "",
        senderDisplayName: currentUserProfile?.displayName || undefined,
        senderName: currentUserProfile?.username || "",
        senderAvatar: currentUserProfile?.avatar,
        timestamp: new Date(),
        isFromCurrentUser: true,
        type: "direct",
        isRead: false,
        messageType: "voice",
        voiceUrl: voiceUrl,
        voiceDuration: duration,
      };

      console.log("🎤 [VOICE-OPTIMISTIC] Created optimistic message:", {
        messageType: optimisticMessage.messageType,
        voiceUrl: optimisticMessage.voiceUrl,
        voiceDuration: optimisticMessage.voiceDuration,
      });

      // Enable auto-scroll
      shouldAutoScrollRef.current = true;

      // OPTIMISTIC UPDATE
      setConversations((prev) => {
        const newMap = new Map(prev);
        const currentMessages = newMap.get(friendId) || [];
        newMap.set(friendId, [...currentMessages, optimisticMessage]);
        return newMap;
      });

      // Send to API
      console.log("🎤 [VOICE-SEND] Sending to backend:", {
        type: "voice",
        voiceUrl: uploadResponse.url,
        voiceDuration: duration,
      });

      const response = await sendDirectMessage(friendId, {
        token,
        content: "Tin nhắn thoại",
        type: "voice",
        voiceUrl: voiceUrl,
        voiceDuration: duration,
        replyTo: replyingTo?.id,
      });

      // Clear reply preview
      setReplyingTo(null);

      console.log("✅ [VOICE-SEND] Response from backend:", response);
      console.log("🎤 [VOICE-SEND-DEBUG] Response fields:", {
        _id: response._id,
        type: response.type,
        voiceUrl: response.voiceUrl,
        voiceDuration: response.voiceDuration,
        content: response.content,
      });

      // Replace optimistic message with real message from server
      setConversations((prev) => {
        const newMap = new Map(prev);
        const currentMessages = newMap.get(friendId) || [];

        // Find optimistic message
        const optimisticIndex = currentMessages.findIndex(
          (m) => m.id === optimisticMessage.id,
        );

        if (optimisticIndex !== -1) {
          console.log(
            "✅ [VOICE-SEND] Replacing optimistic message with server response",
          );

          const realMessage: UIMessage = {
            id: response._id,
            text: response.content,
            senderId: response.senderId._id,
            senderEmail: response.senderId.email,
            senderDisplayName: response.senderId.displayName || undefined,
            senderName: response.senderId.username || response.senderId.email,
            senderAvatar: response.senderId.avatar,
            timestamp: new Date(response.createdAt),
            isFromCurrentUser: true,
            type: "direct",
            isRead: response.isRead || false,
            messageType: response.type || "voice",
            voiceUrl: response.voiceUrl ?? voiceUrl,
            voiceDuration: response.voiceDuration ?? duration,
          };

          console.log("🎤 [VOICE-SEND-DEBUG] Created realMessage:", {
            id: realMessage.id,
            messageType: realMessage.messageType,
            voiceUrl: realMessage.voiceUrl,
            voiceDuration: realMessage.voiceDuration,
          });

          const updated = [...currentMessages];
          updated[optimisticIndex] = realMessage;
          newMap.set(friendId, updated);
        } else {
          console.warn(
            "⚠️ [VOICE-SEND] Optimistic message not found, adding response",
          );
        }

        return newMap;
      });

      console.log("✅ [VOICE-SEND] Sent to backend successfully");
      setIsUploadingVoice(false);
    } catch (err) {
      console.error("Failed to send voice message:", err);
      setError("Không gửi được tin nhắn thoại");
      setIsUploadingVoice(false);
      setIsRecordingVoice(false);
    }
  };

  // Handle cancel voice recording
  const handleVoiceCancelRecording = () => {
    setIsRecordingVoice(false);
  };

  const handleCreateServer = async () => {
    if (!serverName.trim()) return;

    try {
      const newServer = await serversApi.createServer(serverName, undefined, undefined, undefined, undefined, language as "vi" | "en" | "ja" | "zh");

      const allCh = newServer.channels as serversApi.Channel[];
      const serverWithChannels: BackendServer = {
        ...newServer,
        infoChannels: allCh.filter(
          (c) => c.type === "text" && c.category === "info" && !c.categoryId,
        ),
        textChannels: allCh.filter((c) => c.type === "text" && c.category !== "info"),
        voiceChannels: allCh.filter((c) => c.type === "voice"),
      };

      setServers([...servers, serverWithChannels]);
      setSelectedServer(serverWithChannels._id);
      setShowCreateServerModal(false);
      setServerName("");
    } catch (err) {
      console.error("Failed to create server", err);
      setError("Không tạo được máy chủ");
    }
  };

  const handleServerCreated = async (serverId: string) => {
    try {
      // Fetch the newly created server with its channels
      const newServer = await serversApi.getServer(serverId);
      const allChannels = newServer.channels as serversApi.Channel[];

      const serverWithChannels: BackendServer = {
        ...newServer,
        infoChannels: allChannels.filter(
          (c) => c.type === "text" && c.category === "info" && !c.categoryId,
        ),
        textChannels: allChannels.filter((c) => c.type === "text" && c.category !== "info"),
        voiceChannels: allChannels.filter((c) => c.type === "voice"),
      };

      setServers([...servers, serverWithChannels]);
      setSelectedServer(serverWithChannels._id);

      // Select the first text channel if available
      if (serverWithChannels.textChannels && serverWithChannels.textChannels.length > 0) {
        setSelectedChannel(serverWithChannels.textChannels[0]._id);
      }
    } catch (err) {
      console.error("Failed to fetch created server", err);
      setError("Không tải được thông tin máy chủ");
    }
  };

  const openCreateChannelModal = (type: ChannelTypeForCreate, sectionLabel?: string, categoryId?: string) => {
    setCreateChannelDefaultType(type);
    setCreateChannelSectionLabel(sectionLabel ?? "");
    setCreateChannelCategoryId(categoryId);
    setShowCreateChannelModal(true);
  };

  const handleCreateChannel = async (
    name: string,
    type: "text" | "voice",
    isPrivate: boolean,
  ) => {
    if (!selectedServer) return;
    await serversApi.createChannel(selectedServer, name, type, undefined, isPrivate, createChannelCategoryId);
    await loadChannels(selectedServer);
  };

  const handleEditChannel = async (channelId: string, newName: string) => {
    if (!selectedServer) return;
    await serversApi.updateChannel(selectedServer, channelId, newName);
    const updateName = (list: serversApi.Channel[]) =>
      list.map((c) => (c._id === channelId ? { ...c, name: newName } : c));
    setAllChannels((prev) => updateName(prev));
    setTextChannels((prev) => updateName(prev));
    setInfoChannels((prev) => updateName(prev));
    setVoiceChannels((prev) => updateName(prev));
  };

  const handleDeleteChannel = async (channelId: string) => {
    if (!selectedServer) return;
    await serversApi.deleteChannel(selectedServer, channelId);
    const removeChannel = (list: serversApi.Channel[]) => list.filter((c) => c._id !== channelId);
    setAllChannels((prev) => removeChannel(prev));
    setTextChannels((prev) => removeChannel(prev));
    setInfoChannels((prev) => removeChannel(prev));
    setVoiceChannels((prev) => removeChannel(prev));
    if (selectedChannel === channelId) {
      const remaining = textChannels.filter((c) => c._id !== channelId);
      setSelectedChannel(remaining.length > 0 ? remaining[0]._id : null);
    }
  };

  const handleCreateCategory = async (name: string, isPrivate: boolean) => {
    if (!selectedServer) return;
    const created = await serversApi.createCategory(selectedServer, name, isPrivate);
    setServerCategories((prev) => [...prev, created]);
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!selectedServer) return;
    try {
      await serversApi.deleteCategory(selectedServer, categoryId);
      setServerCategories((prev) => prev.filter((c) => c._id !== categoryId));
      setAllChannels((prev) =>
        prev.map((c) => {
          const cid = typeof c.categoryId === "string" ? c.categoryId : String((c.categoryId as any)?._id ?? c.categoryId);
          return cid === categoryId ? { ...c, categoryId: null as any } : c;
        }),
      );
      await loadChannels(selectedServer, { keepSelectedChannel: true });
    } catch (err) {
      console.error("Failed to delete category", err);
    }
  };

  const handleDeleteUncategorizedCategory = async () => {
    if (!selectedServer) return;
    const uncategorized = getUncategorizedChannels().filter((ch) => !ch.isDefault);
    if (uncategorized.length === 0) return;
    try {
      for (const ch of uncategorized) {
        await serversApi.deleteChannel(selectedServer, ch._id);
      }
      if (selectedChannel && uncategorized.some((ch) => ch._id === selectedChannel)) {
        const remaining = textChannels.filter(
          (c) => !uncategorized.some((deleted) => deleted._id === c._id),
        );
        setSelectedChannel(remaining.length > 0 ? remaining[0]._id : null);
      }
      await loadChannels(selectedServer);
    } catch (err) {
      console.error("Failed to delete uncategorized channels", err);
    }
  };

  const handleRenameCategory = async (categoryId: string, newName: string) => {
    if (!selectedServer || !newName.trim()) return;
    try {
      const trimmed = newName.trim();
      await serversApi.updateCategory(selectedServer, categoryId, trimmed);
      setServerCategories((prev) =>
        prev.map((c) => (c._id === categoryId ? { ...c, name: trimmed } : c)),
      );
    } catch (err) {
      console.error("Failed to rename category", err);
    }
    setRenamingCategoryId(null);
    setRenamingCategoryName("");
  };

  // ── Mention helpers ──

  const fetchMentionSuggestions = useCallback(
    async (keyword: string) => {
      if (!selectedServer || !canUseMentions) return;
      try {
        const results = await serversApi.getMentionSuggestions(selectedServer, keyword);
        setMentionSuggestions(results);
        setMentionActiveIndex(0);
      } catch {
        setMentionSuggestions([]);
      }
    },
    [selectedServer, canUseMentions],
  );

  const handleMentionDetect = useCallback(
    (value: string, cursorPos: number) => {
      if (!canUseMentions) {
        setMentionOpen(false);
        return;
      }
      let atPos = -1;
      for (let i = cursorPos - 1; i >= 0; i--) {
        const ch = value[i];
        if (ch === "@") { atPos = i; break; }
        if (ch === " " || ch === "\n") break;
      }

      if (atPos === -1 || (atPos > 0 && value[atPos - 1] !== " " && value[atPos - 1] !== "\n" && atPos !== 0)) {
        if (atPos === -1) { setMentionOpen(false); return; }
      }

      const keyword = value.slice(atPos + 1, cursorPos);
      setMentionOpen(true);
      setMentionStartPos(atPos);
      setMentionKeyword(keyword);

      if (mentionFetchTimer.current) clearTimeout(mentionFetchTimer.current);
      mentionFetchTimer.current = setTimeout(() => fetchMentionSuggestions(keyword), 150);
    },
    [fetchMentionSuggestions, canUseMentions],
  );

  const handleMentionSelect = useCallback(
    (suggestion: serversApi.MentionSuggestion) => {
      const input = messageInputRef.current;
      if (!input || mentionStartPos === -1) return;

      let insertText: string;
      if (suggestion.type === "user") {
        insertText = `@${suggestion.description || suggestion.name}`;
      } else if (suggestion.type === "special") {
        insertText =
          suggestion.id === "special_here"
            ? "@here"
            : suggestion.id === "special_everyone"
              ? "@everyone"
              : suggestion.name;
      } else {
        insertText = suggestion.name;
      }

      const before = messageText.slice(0, mentionStartPos);
      const after = messageText.slice(input.selectionStart ?? messageText.length);
      const newText = before + insertText + " " + after;
      setMessageText(newText);
      setMentionOpen(false);
      setMentionKeyword("");
      setMentionStartPos(-1);

      requestAnimationFrame(() => {
        if (messageInputRef.current) {
          const pos = before.length + insertText.length + 1;
          messageInputRef.current.setSelectionRange(pos, pos);
          messageInputRef.current.focus();
        }
      });
    },
    [mentionStartPos, messageText],
  );

  const handleMentionKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!mentionOpen || mentionSuggestions.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionActiveIndex((prev) =>
          prev < mentionSuggestions.length - 1 ? prev + 1 : 0,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionActiveIndex((prev) =>
          prev > 0 ? prev - 1 : mentionSuggestions.length - 1,
        );
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        handleMentionSelect(mentionSuggestions[mentionActiveIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setMentionOpen(false);
      }
    },
    [mentionOpen, mentionSuggestions, mentionActiveIndex, handleMentionSelect],
  );

  // ── Drag-and-drop helpers ──

  const getChannelsForCategory = useCallback(
    (categoryId: string) =>
      allChannels
        .filter((c) => {
          const cid =
            typeof c.categoryId === "string"
              ? c.categoryId
              : c.categoryId
                ? String((c.categoryId as any)._id ?? c.categoryId)
                : null;
          return cid === categoryId;
        })
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [allChannels],
  );

  const getUncategorizedChannels = useCallback(
    () =>
      allChannels
        .filter((c) => {
          if (!c.categoryId) return true;
          const cid =
            typeof c.categoryId === "string"
              ? c.categoryId
              : String((c.categoryId as any)?._id ?? c.categoryId);
          return !cid;
        })
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [allChannels],
  );

  /** Theo menu máy chủ «Ẩn các kênh bị tắt âm» — lưu prefs theo server. */
  const hideMutedChannelsEffective = useMemo(() => {
    if (!currentUserId || !selectedServer) return false;
    return sidebarPrefs.getServerPrefs(currentUserId, selectedServer).hideMutedChannels === true;
  }, [currentUserId, selectedServer, sidebarPrefsTick]);

  const isChannelMutedInSidebarPrefs = useCallback(
    (channelId: string) => {
      if (!currentUserId || !selectedServer) return false;
      const sp = sidebarPrefs.getServerPrefs(currentUserId, selectedServer);
      return sidebarPrefs.isChannelMuted(sp.channels[channelId]);
    },
    [currentUserId, selectedServer, sidebarPrefsTick],
  );

  const visibleChannelsIfHideMuted = useCallback(
    <T extends { _id: string }>(list: T[]) => {
      if (!hideMutedChannelsEffective) return list;
      return list.filter((ch) => !isChannelMutedInSidebarPrefs(ch._id));
    },
    [hideMutedChannelsEffective, isChannelMutedInSidebarPrefs],
  );

  const resetDragState = useCallback(() => {
    setDragType(null);
    setDragId(null);
    setDragOverId(null);
    setDragOverCategoryId(null);
    setDragPosition("after");
  }, []);

  // ── Category drag ──

  const handleCategoryDragStart = useCallback(
    (e: React.DragEvent, catId: string) => {
      if (!canDragChannels) return;
      setDragType("category");
      setDragId(catId);
      e.dataTransfer.effectAllowed = "move";
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.style.opacity = "0.4";
      }
    },
    [canDragChannels],
  );

  const handleCategoryDragOver = useCallback(
    (e: React.DragEvent, targetCatId: string) => {
      if (dragType !== "category" || dragId === targetCatId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      setDragOverId(targetCatId);
      setDragPosition(e.clientY < midY ? "before" : "after");
    },
    [dragType, dragId],
  );

  const handleCategoryDrop = useCallback(
    async (e: React.DragEvent, targetCatId: string) => {
      e.preventDefault();
      if (dragType !== "category" || !dragId || dragId === targetCatId || !selectedServer) {
        resetDragState();
        return;
      }
      const ordered = [...serverCategories];
      const fromIdx = ordered.findIndex((c) => c._id === dragId);
      let toIdx = ordered.findIndex((c) => c._id === targetCatId);
      if (fromIdx === -1 || toIdx === -1) { resetDragState(); return; }
      const [moved] = ordered.splice(fromIdx, 1);
      if (dragPosition === "after") toIdx = Math.min(toIdx + 1, ordered.length);
      if (fromIdx < toIdx) toIdx = Math.max(0, toIdx);
      ordered.splice(toIdx, 0, moved);
      setServerCategories(ordered);
      resetDragState();
      try {
        await serversApi.reorderCategories(selectedServer, ordered.map((c) => c._id));
      } catch {
        await loadChannels(selectedServer);
      }
    },
    [dragType, dragId, dragPosition, serverCategories, selectedServer, loadChannels, resetDragState],
  );

  // ── Channel drag (cross-category supported) ──

  const handleChannelDragStart = useCallback(
    (e: React.DragEvent, channelId: string) => {
      if (!canDragChannels) return;
      e.stopPropagation();
      setDragType("channel");
      setDragId(channelId);
      e.dataTransfer.effectAllowed = "move";
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.style.opacity = "0.4";
      }
    },
    [canDragChannels],
  );

  const handleChannelDragOver = useCallback(
    (e: React.DragEvent, targetChannelId: string, targetCatId: string) => {
      if (dragType !== "channel" || dragId === targetChannelId) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      setDragOverId(targetChannelId);
      setDragOverCategoryId(targetCatId);
      setDragPosition(e.clientY < midY ? "before" : "after");
    },
    [dragType, dragId],
  );

  const handleChannelDrop = useCallback(
    async (e: React.DragEvent, targetChannelId: string, targetCatId: string) => {
      e.preventDefault();
      e.stopPropagation();
      if (dragType !== "channel" || !dragId || dragId === targetChannelId || !selectedServer) {
        resetDragState();
        return;
      }
      const draggedChannel = allChannels.find((c) => c._id === dragId);
      if (!draggedChannel) { resetDragState(); return; }

      const sourceCatId = draggedChannel.categoryId || "";
      const targetChannels = getChannelsForCategory(targetCatId).filter((c) => c._id !== dragId);
      const dropIdx = targetChannels.findIndex((c) => c._id === targetChannelId);
      const insertIdx = dragPosition === "after" ? dropIdx + 1 : dropIdx;
      targetChannels.splice(insertIdx, 0, { ...draggedChannel, categoryId: targetCatId });

      // Optimistic update
      const updated = allChannels.map((c) => {
        if (c._id === dragId) return { ...c, categoryId: targetCatId };
        return c;
      });
      setAllChannels(updated);
      setTextChannels(updated.filter((c) => c.type === "text"));
      setVoiceChannels(updated.filter((c) => c.type === "voice"));
      resetDragState();

      try {
        await serversApi.reorderChannels(
          selectedServer,
          targetCatId,
          targetChannels.map((c) => c._id),
        );
      } catch {
        await loadChannels(selectedServer);
      }
    },
    [dragType, dragId, dragPosition, selectedServer, allChannels, getChannelsForCategory, loadChannels, resetDragState],
  );

  // Drop channel on empty category area
  const handleCategoryBodyDrop = useCallback(
    async (e: React.DragEvent, targetCatId: string) => {
      e.preventDefault();
      if (dragType !== "channel" || !dragId || !selectedServer) {
        resetDragState();
        return;
      }
      const draggedChannel = allChannels.find((c) => c._id === dragId);
      if (!draggedChannel) { resetDragState(); return; }

      const targetChannels = getChannelsForCategory(targetCatId).filter((c) => c._id !== dragId);
      targetChannels.push({ ...draggedChannel, categoryId: targetCatId });

      const updated = allChannels.map((c) => {
        if (c._id === dragId) return { ...c, categoryId: targetCatId };
        return c;
      });
      setAllChannels(updated);
      setTextChannels(updated.filter((c) => c.type === "text"));
      setVoiceChannels(updated.filter((c) => c.type === "voice"));
      resetDragState();

      try {
        await serversApi.reorderChannels(
          selectedServer,
          targetCatId,
          targetChannels.map((c) => c._id),
        );
      } catch {
        await loadChannels(selectedServer);
      }
    },
    [dragType, dragId, selectedServer, allChannels, getChannelsForCategory, loadChannels, resetDragState],
  );

  const handleDragEnd = useCallback(
    (e: React.DragEvent) => {
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.style.opacity = "1";
      }
      resetDragState();
    },
    [resetDragState],
  );

  const handleOpenEventImageEditor = useCallback((currentImageUrl: string | null) => {
    return new Promise<string | null>((resolve) => {
      eventImageEditorResolveRef.current = resolve;
      setEventImageEditorCurrentUrl(currentImageUrl);
      setShowEventImageEditor(true);
    });
  }, []);

  const handleEventImageEditorConfirm = useCallback((url: string) => {
    eventImageEditorResolveRef.current?.(url);
    eventImageEditorResolveRef.current = null;
    setShowEventImageEditor(false);
  }, []);

  const handleEventImageEditorClose = useCallback(() => {
    eventImageEditorResolveRef.current?.(null);
    eventImageEditorResolveRef.current = null;
    setShowEventImageEditor(false);
  }, []);

  const handleEventCreated = useCallback((event: serversApi.ServerEvent, link: string) => {
    setShareEventLink(link);
    setCreatedEventDetail(event);
  }, []);

  const openCreateEventWizard = useCallback(() => {
    setShowEventsPopup(false);
    setShowCreateEventWizard(true);
  }, []);

  const handleWaveSticker = useCallback(
    async (
      channelId: string,
      welcomeMessageId: string,
      welcomeSenderId: string,
    ) => {
      if (!channelId) return;
      setWavingIds((prev) => new Set(prev).add(welcomeMessageId));
      try {
        const isNewMember = welcomeSenderId === currentUserId;

        const waveSticker = await getRandomWaveSticker();
        const giphyId = waveSticker?.id;

        const newMsg = await serversApi.sendWaveSticker(
          channelId,
          isNewMember ? undefined : welcomeMessageId,
          giphyId,
        );

        const replyRaw = newMsg.replyTo;
        let replyToMessage: UIMessage["replyToMessage"] = null;
        if (!isNewMember && replyRaw && typeof replyRaw === "object") {
          const rt = replyRaw as any;
          replyToMessage = {
            id: rt._id,
            senderId: rt.senderId?._id ?? rt.senderId,
            senderDisplayName: rt.senderId?.displayName,
            senderName: rt.senderId?.username || rt.senderId?.email,
            messageType: rt.messageType || "welcome",
            text: rt.content,
          };
        }

        const uiMsg: UIMessage = {
          id: newMsg._id,
          text: newMsg.content,
          senderId:
            typeof newMsg.senderId === "string"
              ? newMsg.senderId
              : newMsg.senderId._id,
          senderEmail: "",
          senderName: currentUserProfile?.username || "",
          senderDisplayName: currentUserProfile?.displayName || undefined,
          senderAvatar: currentUserProfile?.avatar,
          timestamp: new Date(newMsg.createdAt),
          isFromCurrentUser: true,
          type: "server",
          messageType: (newMsg as any).messageType || "sticker",
          giphyId: (newMsg as any).giphyId || undefined,
          replyTo: isNewMember ? undefined : welcomeMessageId,
          replyToMessage,
          reactions: [],
        };
        setMessages((prev) => appendServerMessage(prev, uiMsg));
      } catch (e) {
        console.error("Wave sticker failed", e);
      } finally {
        setWavingIds((prev) => {
          const next = new Set(prev);
          next.delete(welcomeMessageId);
          return next;
        });
      }
    },
    [currentUserId, currentUserProfile],
  );

  const renderMessageContent = useCallback(
    (message: UIMessage) => {
      const {
        text,
        messageType,
        giphyId,
        customStickerUrl,
        voiceUrl,
        voiceDuration,
      } = message;

      if (messageType === "system") {
        return (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "4px 16px",
            margin: "2px 0",
          }}>
            <div style={{
              flex: 1,
              height: 1,
              background: "var(--color-border)",
            }} />
            <span style={{
              fontSize: 13,
              color: "var(--color-text-muted)",
              whiteSpace: "nowrap",
            }}>
              <span style={{ color: "var(--color-panel-success)", marginRight: 4 }}>→</span>
              {text}
            </span>
            <span style={{
              fontSize: 12,
              color: "var(--color-text-muted)",
              whiteSpace: "nowrap",
              opacity: 0.7,
            }}>
              {formatMessageTime(message.timestamp)}
            </span>
            <div style={{
              flex: 1,
              height: 1,
              background: "var(--color-border)",
            }} />
          </div>
        );
      }

      if (messageType === "welcome") {
        const isWaving = wavingIds.has(message.id);
        const showWaveButton = message.stickerReplyWelcomeEnabled !== false;
        const displayName =
          message.senderDisplayName || message.senderName || t("chat.welcome.unknownUser");
        return (
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 0,
            padding: "8px 0",
            margin: "4px 0",
          }}>
            <div style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
            }}>
              <span style={{
                color: "var(--color-panel-success)",
                fontSize: 20,
                lineHeight: "24px",
                flexShrink: 0,
              }}>→</span>
              <div style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                minWidth: 0,
              }}>
                <div>
                  <span style={{ color: "var(--color-text)", fontSize: 14 }}>{t("chat.welcome.greeting").replace("{name}", displayName)}</span>
                  <span style={{
                    color: "var(--color-text-muted)",
                    fontSize: 12,
                    marginLeft: 8,
                  }}>
                    {formatMessageTime(message.timestamp)}
                  </span>
                </div>
                {showWaveButton && (
                  <button
                    type="button"
                    disabled={isWaving}
                    onClick={() => {
                      if (selectedChannel) {
                        handleWaveSticker(selectedChannel, message.id, message.senderId);
                      }
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "5px 12px",
                      background: isWaving
                        ? "var(--color-surface-muted)"
                        : "var(--color-panel-hover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 6,
                      color: isWaving
                        ? "var(--color-text-muted)"
                        : "var(--color-text)",
                      cursor: isWaving ? "not-allowed" : "pointer",
                      fontSize: 13,
                      width: "fit-content",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {isWaving ? (
                      <>
                        <span
                          style={{
                            display: "inline-block",
                            width: 14,
                            height: 14,
                            border: "2px solid var(--color-text-muted)",
                            borderTopColor: "transparent",
                            borderRadius: "50%",
                            animation: "spin 0.6s linear infinite",
                          }}
                        />
                        {t("chat.welcome.waving")}
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: 15 }}>👋</span>
                        {t("chat.welcome.waveBtn").replace("{name}", displayName)}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      }

      if (messageType === "voice" && voiceUrl) {
        return (
          <VoiceMessage
            voiceUrl={voiceUrl}
            duration={voiceDuration ?? 0}
            isFromCurrentUser={message.isFromCurrentUser}
          />
        );
      }

      if (messageType === "sticker" && customStickerUrl) {
        return (
          <div className={styles.mediaMessage}>
            <img
              src={customStickerUrl}
              alt=""
              style={{
                maxWidth: "200px",
                maxHeight: "200px",
                borderRadius: "8px",
                display: "block",
              }}
              loading="lazy"
            />
          </div>
        );
      }

      // Check if message is GIF or Sticker from Giphy
      if ((messageType === "gif" || messageType === "sticker") && giphyId) {
        return (
          <div className={styles.mediaMessage}>
            <GiphyMessage giphyId={giphyId} messageType={messageType} />
          </div>
        );
      }

      if (messageType === "sticker" && !giphyId && !customStickerUrl) {
        return (
          <div style={{ fontSize: 64, padding: "8px", lineHeight: 1 }}>
            👋
          </div>
        );
      }

      // Check if message contains poll
      const pollMatch = text.match(/📊 \[Poll\]: ([a-f0-9]+)/);
      if (pollMatch) {
        const pollId = pollMatch[1];
        return <PollMessage pollId={pollId} token={token} onError={setError} />;
      }

      // Check if message contains media
      const imageMatch = text.match(/📷 \[Image\]: (https?:\/\/[^\s]+)/);
      const videoMatch = text.match(/🎬 \[Video\]: (https?:\/\/[^\s]+)/);
      const gifMatch = text.match(/(https?:\/\/[^\s]+\.gif)/i);

      if (imageMatch) {
        const imageUrl = imageMatch[1];
        const isBlurred = imageUrl.includes("e_blur:");
        const modResult = message.contentModerationResult;

        if (isBlurred) {
          return (
            <div>
              <div className={styles.mediaMessage}>
                <BlurredImage
                  blurredUrl={imageUrl}
                  canReveal={isAgeRestrictedRef.current}
                  className={styles.messageImage}
                />
              </div>
              {modResult === "rejected" && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 10px", borderRadius: 4,
                  background: "rgba(237, 66, 69, 0.15)", color: "#ed4245",
                  fontSize: 12, marginTop: 4,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                  Hình ảnh đã bị xóa do vi phạm chính sách nội dung.
                </div>
              )}
            </div>
          );
        }

        return (
          <div>
            <div className={styles.mediaMessage}>
              <img
                src={imageUrl}
                alt="Ảnh được chia sẻ"
                className={styles.messageImage}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  e.currentTarget.nextElementSibling?.classList.remove(
                    styles.hidden,
                  );
                }}
              />
              <span
                className={styles.hidden}
                style={{ fontSize: "12px", color: "var(--color-text-muted)" }}
              >
                Không tải được ảnh
              </span>
            </div>
            {modResult === "rejected" && (
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 10px", borderRadius: 4,
                background: "rgba(237, 66, 69, 0.15)", color: "#ed4245",
                fontSize: 12, marginTop: 4,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                Hình ảnh đã bị xóa do vi phạm chính sách nội dung.
              </div>
            )}
          </div>
        );
      }

      if (videoMatch) {
        const videoUrl = videoMatch[1];
        return (
          <div className={styles.mediaMessage}>
            <video
              src={videoUrl}
              controls
              className={styles.messageVideo}
              onError={(e) => {
                e.currentTarget.style.display = "none";
                e.currentTarget.nextElementSibling?.classList.remove(
                  styles.hidden,
                );
              }}
            >
              Your browser does not support video playback.
            </video>
            <span
              className={styles.hidden}
              style={{ fontSize: "12px", color: "var(--color-text-muted)" }}
            >
              Không tải được video
            </span>
          </div>
        );
      }

      if (gifMatch) {
        const gifUrl = gifMatch[1];
        return (
          <div className={styles.mediaMessage}>
            <img src={gifUrl} alt="Ảnh GIF" className={styles.messageGif} />
          </div>
        );
      }

      // Server invite link detection
      const inviteLinkMatch = text.match(/(https?:\/\/[^\s]+\/invite\/server\/([a-f0-9]{24}))/i);
      if (inviteLinkMatch) {
        const fullUrl = inviteLinkMatch[1];
        const sid = inviteLinkMatch[2];
        const textBefore = text.slice(0, inviteLinkMatch.index).trim();
        const textAfter = text.slice((inviteLinkMatch.index ?? 0) + fullUrl.length).trim();
        return (
          <div>
            {textBefore && <div style={{ marginBottom: 4 }}>{textBefore}</div>}
            <a href={fullUrl} style={{ color: "#00a8fc", fontSize: 14, wordBreak: "break-all" }}>{fullUrl}</a>
            <ServerInviteCard serverId={sid} inviteUrl={fullUrl} />
            {textAfter && <div style={{ marginTop: 4 }}>{textAfter}</div>}
          </div>
        );
      }

      // Moderation rejection notice in text
      if (text.includes("⚠️ Hình ảnh đã bị xóa do vi phạm chính sách nội dung.")) {
        return (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 10px", borderRadius: 4,
            background: "rgba(237, 66, 69, 0.15)", color: "#ed4245",
            fontSize: 13,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
            Hình ảnh đã bị xóa do vi phạm chính sách nội dung.
          </div>
        );
      }

      // Regular text message (emoji máy chủ dạng :ten: — kênh chat & DM dùng chung)
      const map = serverEmojiRenderMap;
      const emojiPx = getServerCustomEmojiRenderSizePx(text, map);
      const isJumboEmojiRow = emojiPx >= CUSTOM_EMOJI_JUMBO_PX;
      const re = /:([a-zA-Z0-9_]{1,80}):/g;
      const nodes: React.ReactNode[] = [];
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        if (m.index > last) {
          nodes.push(<span key={`t-${last}`}>{text.slice(last, m.index)}</span>);
        }
        const url = map[m[1].toLowerCase()];
        if (url) {
          nodes.push(
            <img
              key={`e-${m.index}`}
              src={url}
              alt={m[0]}
              style={{
                width: emojiPx,
                height: emojiPx,
                verticalAlign: "middle",
                objectFit: "contain",
                display: "inline-block",
                margin: isJumboEmojiRow ? "2px 4px 2px 0" : undefined,
              }}
            />,
          );
        } else {
          nodes.push(<span key={`l-${m.index}`}>{m[0]}</span>);
        }
        last = m.index + m[0].length;
      }
      if (last < text.length) {
        nodes.push(<span key="tail">{text.slice(last)}</span>);
      }
      return (
        <span
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            ...(isJumboEmojiRow
              ? {
                  display: "inline-flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 6,
                }
              : {}),
          }}
        >
          {nodes}
        </span>
      );
    },
    [token, wavingIds, selectedChannel, handleWaveSticker, serverEmojiRenderMap],
  );

  // Handle file upload
  const handleFileUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/*,video/*";
    input.onchange = async (e: any) => {
      const files: File[] = Array.from(e.target.files || []);
      if (files.length === 0) return;

      setShowPlusMenu(false);

      try {
        const tooLarge = files.find((f) => f.size > maxUploadBytes);
        if (tooLarge) {
          setError(
            `File quá lớn. Tối đa ${(maxUploadBytes / 1024 / 1024).toFixed(0)}MB`,
          );
          return;
        }

        // Validate video duration (max 3 minutes = 180 seconds)
        for (const file of files) {
          if (file.type.startsWith("video/")) {
            const duration = await getVideoDuration(file);
            if (duration > 180) {
              setError("Video phải dài 3 phút trở xuống");
              return;
            }
          }
        }

        // ✅ FIX: Create optimistic loading messages for each file
        const loadingMessages: UIMessage[] = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const isImage = file.type.startsWith("image/");
          const isVideo = file.type.startsWith("video/");
          const tempId = `temp-upload-${Date.now()}-${i}`;

          const loadingMessage: UIMessage = {
            id: tempId,
            text: isImage ? `📤 Uploading image...` : `📤 Uploading video...`,
            senderId: currentUserId,
            senderEmail: "",
            senderDisplayName: currentUserProfile?.displayName || undefined,
            senderName: currentUserProfile?.username || "",
            senderAvatar: currentUserProfile?.avatar,
            timestamp: new Date(),
            isFromCurrentUser: true,
            type: selectedDirectMessageFriend ? "direct" : "server",
          };

          loadingMessages.push(loadingMessage);

          // Add to UI immediately
          if (selectedDirectMessageFriend) {
            setMessages((prev) => [...prev, loadingMessage]);
            setConversations((prev) => {
              const newMap = new Map(prev);
              const current = newMap.get(selectedDirectMessageFriend._id) || [];
              newMap.set(selectedDirectMessageFriend._id, [
                ...current,
                loadingMessage,
              ]);
              return newMap;
            });
          } else if (selectedChannel) {
            setMessages((prev) => appendServerMessage(prev, loadingMessage));
          }
        }

        // Auto-scroll (instant for media uploads)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTop =
                messagesContainerRef.current.scrollHeight;
            }
          });
        });

        // ✅ FIX: Upload files in background
        let uploadResults;
        if (files.length === 1) {
          const result = await uploadMedia({
            token,
            file: files[0],
            cordigramUploadContext: "messages",
          });
          uploadResults = [result];
        } else {
          uploadResults = await uploadMediaBatch({
            token,
            files,
            cordigramUploadContext: "messages",
          });
        }

        // ✅ FIX: Send each media and update UI
        for (let i = 0; i < uploadResults.length; i++) {
          const media = uploadResults[i];
          const loadingMsgId = loadingMessages[i].id;
          const isImage = media.resourceType === "image";
          const isVideo = media.resourceType === "video";

          let mediaMessage: string;
          if (isImage) {
            mediaMessage = `📷 [Image]: ${media.url}`;
          } else if (isVideo) {
            mediaMessage = `🎬 [Video]: ${media.url}`;
          } else {
            mediaMessage = media.url;
          }

          // Create final message
          const finalMessage: UIMessage = {
            id: `temp-${Date.now()}-${i}`,
            text: mediaMessage,
            senderId: currentUserId,
            senderEmail: "",
            senderDisplayName: currentUserProfile?.displayName || undefined,
            senderName: currentUserProfile?.username || "",
            senderAvatar: currentUserProfile?.avatar,
            timestamp: new Date(),
            isFromCurrentUser: true,
            type: selectedDirectMessageFriend ? "direct" : "server",
          };

          // Replace loading message with actual content
          if (selectedDirectMessageFriend) {
            setMessages((prev) =>
              prev.map((m) => (m.id === loadingMsgId ? finalMessage : m)),
            );
            setConversations((prev) => {
              const newMap = new Map(prev);
              const current = newMap.get(selectedDirectMessageFriend._id) || [];
              newMap.set(
                selectedDirectMessageFriend._id,
                current.map((m) => (m.id === loadingMsgId ? finalMessage : m)),
              );
              return newMap;
            });

            // Send via WebSocket
            emitSendMessage(selectedDirectMessageFriend._id, mediaMessage, [
              media.url,
            ]);
          } else if (selectedChannel) {
            setMessages((prev) =>
              prev.map((m) => (m.id === loadingMsgId ? finalMessage : m)),
            );

            // Send via API for channel message
            await serversApi.createMessage(selectedChannel, mediaMessage);
          }
        }

        console.log("✅ Files uploaded successfully:", uploadResults);
      } catch (error: any) {
        console.error("❌ Failed to upload files:", error);
        setError(error?.message || "Không tải lên được tệp");
      }
    };
    input.click();
  };

  // Get video duration helper
  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";

      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        resolve(video.duration);
      };

      video.onerror = () => {
        reject(new Error("Không tải được video"));
      };

      video.src = URL.createObjectURL(file);
    });
  };

  // Poll handlers
  const handleCreatePoll = () => {
    setShowPlusMenu(false);
    setShowCreatePollModal(true);
  };

  const handleAddPollOption = () => {
    setPollOptions([...pollOptions, ""]);
  };

  const handleRemovePollOption = (index: number) => {
    if (pollOptions.length > 2) {
      setPollOptions(pollOptions.filter((_, i) => i !== index));
    }
  };

  const handlePollOptionChange = (index: number, value: string) => {
    const newOptions = [...pollOptions];
    newOptions[index] = value;
    setPollOptions(newOptions);
  };

  const handleSubmitPoll = async () => {
    try {
      // Validate
      if (!pollQuestion.trim()) {
        setError("Vui lòng nhập câu hỏi");
        return;
      }

      const validOptions = pollOptions.filter((opt) => opt.trim());
      if (validOptions.length < 2) {
        setError("Cần ít nhất 2 phương án trả lời");
        return;
      }

      // ✅ FIX: Close modal immediately for better UX
      setShowCreatePollModal(false);

      // ✅ FIX: Show loading message
      const loadingMessage: UIMessage = {
        id: `temp-poll-${Date.now()}`,
        text: `📊 Creating poll...`,
        senderId: currentUserId,
        senderEmail: "",
        senderDisplayName: currentUserProfile?.displayName || undefined,
        senderName: currentUserProfile?.username || "",
        senderAvatar: currentUserProfile?.avatar,
        timestamp: new Date(),
        isFromCurrentUser: true,
        type: selectedDirectMessageFriend ? "direct" : "server",
      };

      if (selectedDirectMessageFriend) {
        setMessages((prev) => [...prev, loadingMessage]);
        setConversations((prev) => {
          const newMap = new Map(prev);
          const current = newMap.get(selectedDirectMessageFriend._id) || [];
          newMap.set(selectedDirectMessageFriend._id, [
            ...current,
            loadingMessage,
          ]);
          return newMap;
        });
      } else if (selectedChannel) {
        setMessages((prev) => appendServerMessage(prev, loadingMessage));
      }

      // Auto-scroll (instant for polls)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop =
              messagesContainerRef.current.scrollHeight;
          }
        });
      });

      // Create poll in background
      const poll = await createPoll({
        token,
        question: pollQuestion,
        options: validOptions,
        durationHours: pollDuration,
        allowMultipleAnswers: pollAllowMultiple,
      });

      // Send poll as message
      const pollMessage = `📊 [Poll]: ${poll._id}`;
      // ✅ FIX: Replace loading message with actual poll
      const finalMessage: UIMessage = {
        id: `temp-${Date.now()}`,
        text: pollMessage,
        senderId: currentUserId,
        senderEmail: "",
        senderDisplayName: currentUserProfile?.displayName || undefined,
        senderName: currentUserProfile?.username || "",
        senderAvatar: currentUserProfile?.avatar,
        timestamp: new Date(),
        isFromCurrentUser: true,
        type: selectedDirectMessageFriend ? "direct" : "server",
      };

      if (selectedDirectMessageFriend) {
        setMessages((prev) =>
          prev.map((m) => (m.id === loadingMessage.id ? finalMessage : m)),
        );
        setConversations((prev) => {
          const newMap = new Map(prev);
          const current = newMap.get(selectedDirectMessageFriend._id) || [];
          newMap.set(
            selectedDirectMessageFriend._id,
            current.map((m) => (m.id === loadingMessage.id ? finalMessage : m)),
          );
          return newMap;
        });
        emitSendMessage(selectedDirectMessageFriend._id, pollMessage, []);
      } else if (selectedChannel) {
        setMessages((prev) =>
          prev.map((m) => (m.id === loadingMessage.id ? finalMessage : m)),
        );
        await serversApi.createMessage(selectedChannel, pollMessage);
      }

      // Reset form
      setPollQuestion("");
      setPollOptions(["", ""]);
      setPollDuration(24);
      setPollAllowMultiple(false);
      console.log("✅ Poll created:", poll);
    } catch (error: any) {
      console.error("❌ Failed to create poll:", error);
      setError(error?.message || "Không tạo được khảo sát");
    }
  };

  const handleCancelPoll = () => {
    setShowCreatePollModal(false);
    setPollQuestion("");
    setPollOptions(["", ""]);
    setPollDuration(24);
    setPollAllowMultiple(false);
  };

  useEffect(() => {
    if (!selectedServer || !token) {
      setCurrentServerPermissions(null);
      return;
    }
    if (isAdminView && adminViewServerId && selectedServer === adminViewServerId) {
      setCurrentServerPermissions(null);
      return;
    }
    let cancelled = false;
    serversApi
      .getCurrentUserPermissions(selectedServer)
      .then((p) => {
        if (!cancelled) setCurrentServerPermissions(p);
      })
      .catch(() => {
        if (!cancelled) setCurrentServerPermissions(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedServer, token]);

  useEffect(() => {
    if (!currentUserId || !selectedServer) return;
    const sp = sidebarPrefs.getServerPrefs(currentUserId, selectedServer);
    if (sp.serverNotify) setServerNotificationLevel(sp.serverNotify);
  }, [currentUserId, selectedServer, sidebarPrefsTick]);

  useEffect(() => {
    if (!selectedServer || !token) {
      setNotificationRoleNames([]);
      return;
    }
    const isAdminViewedServer = Boolean(isAdminView && adminViewServerId && selectedServer === adminViewServerId);
    if (isAdminViewedServer) {
      setNotificationRoleNames([]);
      return;
    }
    let cancelled = false;
    serversApi
      .getRoles(selectedServer)
      .then((roles) => {
        if (cancelled) return;
        setNotificationRoleNames(roles.filter((r) => !r.isDefault).map((r) => r.name));
      })
      .catch(() => {
        if (!cancelled) setNotificationRoleNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedServer, token, isAdminView, adminViewServerId]);

  const selectedServerEntity = useMemo(
    () => servers.find((s) => s._id === selectedServer),
    [servers, selectedServer],
  );

  /** Chủ server hoặc (quản lý máy chủ và quản lý kênh) — chỉnh sửa/xóa kênh & danh mục */
  const canManageChannelsStructure = useMemo(() => {
    if (!currentUserId || !selectedServerEntity) return false;
    const p = currentServerPermissions;
    if (p?.isOwner) return true;
    return !!(p?.canManageServer && p?.canManageChannels);
  }, [currentUserId, selectedServerEntity, currentServerPermissions]);

  const canAccessPrivateChannel = useMemo(() => {
    if (!currentUserId || !selectedServerEntity) return false;
    const p = currentServerPermissions;
    if (p?.isOwner) return true;
    return !!(p?.canManageServer || p?.canManageChannels);
  }, [currentUserId, selectedServerEntity, currentServerPermissions]);

  const canManageJoinApplications = useMemo(() => {
    if (!currentUserId || !selectedServerEntity) return false;
    if (currentServerPermissions?.isOwner) return true;
    return Boolean(currentServerPermissions?.canManageServer);
  }, [currentUserId, selectedServerEntity, currentServerPermissions]);

  const ownedServersForPicker = useMemo(() => {
    if (!currentUserId) return [];
    return servers
      .filter(
        (s) =>
          String((s as any).ownerId?._id ?? (s as any).ownerId) === currentUserId,
      )
      .map((s) => ({
        id: s._id,
        name: s.name || "Máy chủ",
        avatarUrl: (s as any).avatarUrl ?? null,
      }));
  }, [servers, currentUserId]);

  const openServerSettingsFromMediaPicker = useCallback(
    async (serverId: string, section: ServerSettingsSection) => {
      const s = servers.find((x) => x._id === serverId);
      if (!s) return;
      setShowGiphyPicker(false);
      setServerSettingsTarget({
        serverId,
        serverName: s.name || "Máy chủ",
        initialSection: section,
      });
      try {
        const perms = await serversApi.getCurrentUserPermissions(serverId);
        setServerSettingsPermissions(perms);
      } catch {
        setServerSettingsPermissions(null);
      }
      try {
        const c = await serversApi.getCommunitySettings(serverId);
        setCommunityEnabled(c.enabled);
      } catch {
        setCommunityEnabled(false);
      }
      setShowServerSettingsPanel(true);
    },
    [servers],
  );

  useEffect(() => {
    setShowJoinApplicationsView(false);
  }, [selectedServer]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (ev: Event) => {
      const d = (ev as CustomEvent<{ serverId: string }>).detail;
      if (!d?.serverId || d.serverId !== selectedServer || !canManageJoinApplications) return;
      setJoinApplicationsRefreshTick((x) => x + 1);
    };
    window.addEventListener("cordigram-join-application-updated", handler as EventListener);
    return () => window.removeEventListener("cordigram-join-application-updated", handler as EventListener);
  }, [selectedServer, canManageJoinApplications]);

  // Applicant: duyệt / từ chối / rút đơn — cập nhật trạng thái truy cập không cần reload trang.
  useEffect(() => {
    if (typeof window === "undefined" || !selectedServer || !currentUserId) return;
    if (isAdminView && selectedServer === adminViewServerId) return;
    const handler = (ev: Event) => {
      const d = (ev as CustomEvent<{ serverId: string; userId: string; status: string }>).detail;
      if (!d || d.serverId !== selectedServer || d.userId !== currentUserId) return;
      if (d.status !== "accepted" && d.status !== "rejected" && d.status !== "withdrawn") return;
      void serversApi.getMyServerAccessStatus(selectedServer).then(setMyServerAccessStatus).catch(() => undefined);
    };
    window.addEventListener("cordigram-join-application-updated", handler as EventListener);
    return () => window.removeEventListener("cordigram-join-application-updated", handler as EventListener);
  }, [selectedServer, currentUserId, isAdminView, adminViewServerId]);

  useEffect(() => {
    if (!selectedServer || !canManageJoinApplications) {
      setJoinAppPendingCount(0);
      return;
    }
    serversApi
      .listJoinApplications(selectedServer, "pending")
      .then((r) => setJoinAppPendingCount(r.pendingCount))
      .catch(() => setJoinAppPendingCount(0));
  }, [selectedServer, canManageJoinApplications, joinApplicationsRefreshTick]);

  // Realtime-ish refresh: avoid "must reload to see pending applications dot"
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!selectedServer || !canManageJoinApplications) return;

    let cancelled = false;
    const refetch = () => {
      serversApi
        .listJoinApplications(selectedServer, "pending")
        .then((r) => {
          if (!cancelled) setJoinAppPendingCount(r.pendingCount);
        })
        .catch(() => {
          if (!cancelled) setJoinAppPendingCount(0);
        });
    };

    // quick initial sync + polling
    refetch();
    const id = window.setInterval(refetch, 6000);

    const onFocus = () => refetch();
    const onVis = () => {
      if (document.visibilityState === "visible") refetch();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [selectedServer, canManageJoinApplications]);

  const leaveVoiceChannel = useCallback(() => {
    const vid = joinedVoiceChannelId;
    setJoinedVoiceChannelId(null);
    setVoiceChannelCallToken(null);
    setVoiceChannelCallServerUrl("");
    setVoiceChannelCallError(null);
    setVoiceMicMuted(false);
    setVoiceSoundMuted(false);
    if (vid && selectedChannel === vid) {
      setSelectedChannel(null);
    }
    if (selectedServer) void loadActiveEvents(selectedServer);
  }, [joinedVoiceChannelId, selectedChannel, selectedServer, loadActiveEvents]);

  const trySelectChannel = useCallback(
    (channelId: string) => {
      const channel = allChannels.find((c) => c._id === channelId);
      if (channel?.isPrivate && !canAccessPrivateChannel) {
        setError("Vai trò của bạn không được phép vào kênh riêng tư này");
        return;
      }
      // Apply mode: pending/rejected applicants cannot access channels yet
      if (
        myServerAccessStatus?.accessMode === "apply" &&
        (myServerAccessStatus?.status === "pending" ||
          myServerAccessStatus?.status === "rejected")
      ) {
        setSelectedChannel(null);
        setJoinedVoiceChannelId(null);
        return;
      }
      setError(null);
      setShowJoinApplicationsView(false);
      setShowExploreView(false);
      if (channel?.type === "voice") {
        setJoinedVoiceChannelId(channelId);
      }
      setSelectedChannel(channelId);
    },
    [
      allChannels,
      canAccessPrivateChannel,
      myServerAccessStatus?.accessMode,
      myServerAccessStatus?.status,
    ],
  );

  const getCategoryCollapseState = useCallback(
    (categoryId: string) => {
      if (!currentUserId || !selectedServer) return { enabled: false, collapsed: false };
      const p = sidebarPrefs.getServerPrefs(currentUserId, selectedServer).categories[categoryId];
      return { enabled: Boolean(p?.collapseUiEnabled), collapsed: Boolean(p?.collapsed) };
    },
    [currentUserId, selectedServer, sidebarPrefsTick],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!canRender) return;
    if (!currentUserId) return;
    const root = document.getElementById("cordigram-messages-root");
    if (!root) return;

    const apply = () => {
      migrateMessagesChromeStorageOnce(currentUserId);
      applyMessagesRootChromeFromStorage(root, currentUserId, getMessagesShellTheme());
    };
    apply();

    const onChrome = () => apply();
    const onShell = () => apply();
    window.addEventListener("cordigram-messages-chrome", onChrome);
    window.addEventListener("cordigram-messages-shell-theme", onShell);
    window.addEventListener("cordigram-chat-settings", onChrome);

    return () => {
      window.removeEventListener("cordigram-messages-chrome", onChrome);
      window.removeEventListener("cordigram-messages-shell-theme", onShell);
      window.removeEventListener("cordigram-chat-settings", onChrome);
      applyAccentColor("#5865F2", root);
    };
  }, [canRender, currentUserId]);

  if (!canRender) {
    return null;
  }

  const currentServer = servers.find((s) => s._id === selectedServer);
  const applyJoinServerMeta =
    (applyJoinServerId && servers.find((s) => s._id === applyJoinServerId)) || currentServer;
  isAgeRestrictedRef.current = Boolean(currentServer?.isAgeRestricted);

  const currentServerNickname = currentServer?.members?.find(
    (m) => String(m.userId) === currentUserId,
  )?.nickname;

  return (
    <div
      id="cordigram-messages-root"
      className={styles.container}
      data-messages-theme={messagesShellTheme}
    >
      {passkeyRequired ? (
        <div className={styles.passkeyOverlay} role="dialog" aria-modal>
          <div className={styles.passkeyCard}>
            <h2 className={styles.passkeyTitle}>Enter passkey</h2>
            <p className={styles.passkeyDesc}>
              To access Messages on this device, please enter your 6-digit
              passkey.
            </p>
            <input
              className={styles.passkeyInput}
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="••••••"
              value={passkeyInput}
              onChange={(e) =>
                setPasskeyInput(e.target.value.replace(/\D/g, ""))
              }
              disabled={passkeySubmitting || passkeyChecking}
            />
            {passkeyError ? (
              <p className={styles.passkeyError}>{passkeyError}</p>
            ) : null}
            <div className={styles.passkeyActions}>
              <button
                type="button"
                className={styles.passkeyButton}
                onClick={handleVerifyPasskeyGate}
                disabled={passkeySubmitting || passkeyChecking}
              >
                {passkeySubmitting ? "Đang xác minh..." : "Xác minh"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {/* Call Room Overlay - DEPRECATED: Calls now open in new tab */}
      {/* {isInCall && callToken && callServerUrl && (
        <CallRoom
          token={callToken}
          serverUrl={callServerUrl}
          onDisconnect={handleEndCall}
          participantName={currentUserProfile?.username || currentUserProfile?.displayName || 'Người dùng'}
          isAudioOnly={isAudioOnly}
        />
      )} */}

      {/* Left Sidebar - Logo & Create Group */}
      <div className={styles.leftSidebar}>
        <img
          src="/logo.png"
          alt="Cordigram"
          className={styles.logoImage}
          onClick={() => {
            setJoinedVoiceChannelId(null);
            setVoiceChannelCallToken(null);
            setVoiceChannelCallServerUrl("");
            setSelectedServer(null);
            setSelectedChannel(null);
            setShowExploreView(false);
              setShowBoostUpgradeView(false);
            setShowJoinApplicationsView(false);
          }}
          style={{ cursor: "pointer" }}
        />

        {!isAdminView ? (
          <button
            className={styles.createBtn}
            title={t("chat.messagesPage.createServerTitle")}
            onClick={() => setShowCreateServerModal(true)}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 5v14M5 12h14"></path>
            </svg>
          </button>
        ) : null}

        {!isAdminView ? (
          <button
            className={`${styles.exploreBtn} ${showExploreView ? styles.exploreBtnActive : ""}`}
            title={showExploreView ? t("chat.messagesPage.exploreClose") : t("chat.messagesPage.exploreTitle")}
            onClick={() => {
              setShowExploreView((prev) => {
                const next = !prev;
                if (next) {
                  setShowJoinApplicationsView(false);
                  setShowBoostUpgradeView(false);
                  setSelectedDirectMessageFriend(null);
                  setSelectedServer(null);
                  setSelectedChannel(null);
                }
                return next;
              });
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M14.5 9.5l-2.2 6.4-1.1-2.5-2.5-1.1 6.4-2.2z" />
            </svg>
          </button>
        ) : null}

        {/* Servers List */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          {servers.map((server) => {
            const hasAvatar = isValidAvatarUrl(server.avatarUrl);
            const initial = server.name.charAt(0).toUpperCase();
            const isAdminViewedServer = isAdminView && server._id === adminViewServerId;
            return (
              <button
                key={server._id}
                className={styles.navBtn}
                onClick={() => {
                  setShowExploreView(false);
                  setShowBoostUpgradeView(false);
                  setShowJoinApplicationsView(false);
                  setSelectedServer(server._id);
                }}
                onContextMenu={async (e) => {
                  e.preventDefault();
                  if (isAdminViewedServer) {
                    setAdminServerContextMenu({ x: e.clientX, y: e.clientY });
                    return;
                  }
                  let permissions: serversApi.CurrentUserServerPermissions | undefined;
                  try {
                    permissions = await serversApi.getCurrentUserPermissions(server._id);
                  } catch {
                    const isOwner = currentUserId !== "" && 
                      String((server as any).ownerId?._id ?? (server as any).ownerId) === currentUserId;
                    permissions = {
                      isOwner,
                      hasCustomRole: isOwner,
                      canKick: isOwner,
                      canBan: isOwner,
                      canTimeout: isOwner,
                      canManageServer: isOwner,
                      canManageChannels: isOwner,
                      canManageEvents: isOwner,
                      canManageExpressions: isOwner,
                      canCreateInvite: true,
                      mentionEveryone: isOwner,
                    };
                  }
                  
                  if (permissions && typeof (permissions as any).hasCustomRole !== "boolean") {
                    try {
                      const membersResp = await serversApi.getServerMembersWithRoles(server._id);
                      const me = membersResp.members.find((m) => m.userId === currentUserId);
                      (permissions as any).hasCustomRole = Boolean(me?.roles?.length);
                    } catch {}
                  }

                  setServerContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    server,
                    permissions,
                  });
                }}
                title={server.name}
                style={{
                  opacity: selectedServer === server._id ? 1 : 0.6,
                  backgroundColor: hasAvatar
                    ? undefined
                    : selectedServer === server._id
                      ? "var(--color-primary)"
                      : "transparent",
                  backgroundImage: hasAvatar
                    ? `url(${server.avatarUrl})`
                    : undefined,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                {!hasAvatar && initial}
              </button>
            );
          })}
        </div>

        <div className={styles.sidebarFooter}>
          <button
            type="button"
            className={styles.settingsBtn}
            title={t("chat.messagesPage.settingsTitle")}
            aria-label={t("chat.messagesPage.settingsTitle")}
            onClick={() => setShowMessagesUserSettings(true)}
          >
            <span className={styles.settingsBtnIcon} aria-hidden>
              ⚙
            </span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className={styles.mainContent}>
        {/* Middle - Channels List */}
        <div className={styles.conversationsList}>
          {/* Thanh thể hiện đang ở DM hay Server + nút Hộp thư */}
          <div className={styles.contextBar}>
            <span className={styles.contextBarLabel}>
              {showExploreView && !selectedDirectMessageFriend
                ? t("chat.messagesPage.contextExplore")
                : selectedServer
                  ? (currentServer?.name ?? t("chat.messagesPage.contextServer"))
                  : t("chat.messagesPage.contextDm")}
            </span>
            <div className={styles.contextBarActions}>
              <span className={styles.inboxBtnWrap}>
                <button
                  type="button"
                  className={styles.inboxBtn}
                  onClick={() => {
                    setShowMessagesInbox(true);
                    setHasInboxNotification(false);
                  }}
                  title={t("chat.messagesPage.inboxTitle")}
                  aria-label={t("chat.messagesPage.inboxAria")}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </button>
                {hasInboxNotification && <span className={styles.inboxDot} aria-hidden />}
              </span>
            </div>
          </div>
          <div className={styles.conversationsContainer}>
            {!selectedServer ? (
              // Main Messages Page - No Server Selected
              <>
                <div className={styles.conversationsScrollArea}>
                {/* Search: opens Discord-style message search modal */}
                <div className={styles.searchInputWrapper}>
                  <button
                    type="button"
                    className={styles.searchButton}
                    onClick={() => {
                      setMessageSearchDmConversationOnly(false);
                      setShowMessageSearch(true);
                    }}
                    title={t("chat.messagesPage.searchButtonAria")}
                    aria-label={t("chat.messagesPage.searchButtonAria")}
                  >
                    {t("chat.messagesPage.searchButtonLabel")}
                  </button>
                </div>

                <div className={styles.dmSidebarMenuList}>
                  <button
                    type="button"
                    className={styles.dmSidebarMenuEntry}
                    onClick={() => {
                      setShowBoostUpgradeView(true);
                      setShowExploreView(false);
                      setShowJoinApplicationsView(false);
                      setSelectedDirectMessageFriend(null);
                      setSelectedServer(null);
                      setSelectedChannel(null);
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 2l2.2 6.8H21l-5.5 4 2.1 7.2L12 16.9 6.4 20l2.1-7.2L3 8.8h6.8L12 2z" />
                    </svg>
                    <span>{t("chat.messagesPage.boostUpgrade")}</span>
                  </button>
                </div>

                {/* Direct Messages Section */}
                <div className={styles.directMessagesSection}>
                  <div className={styles.directMessagesTitleRow}>
                    <h3 className={styles.directMessagesTitle}>
                      {t("chat.messagesPage.directMessages")}
                    </h3>
                  </div>

                  {/* Friends List */}
                  <div className={styles.friendsList}>
                    {friendsForDmSidebar && friendsForDmSidebar.length > 0 ? (
                      friendsForDmSidebar.map((friend) => {
                        const initial =
                          friend.displayName?.charAt(0)?.toUpperCase() ||
                          friend.username?.charAt(0)?.toUpperCase() ||
                          "U";
                        const hue = Math.floor(Math.random() * 360);
                        return (
                          <div
                            key={friend._id}
                            className={`${styles.friendItem} ${selectedDirectMessageFriend?._id === friend._id ? styles.active : ""}`}
                            onClick={() =>
                              handleSelectDirectMessageFriend(friend)
                            }
                            style={{ cursor: "pointer" }}
                          >
                            <div
                              className={styles.friendAvatar}
                              style={{
                                backgroundImage: isValidAvatarUrl(
                                  friend.avatarUrl,
                                )
                                  ? `url(${friend.avatarUrl})`
                                  : `linear-gradient(${hue}deg, hsl(${hue}, 70%, 60%), hsl(${hue + 60}, 70%, 60%))`,
                                backgroundSize: "cover",
                                backgroundPosition: "center",
                              }}
                            >
                              {!isValidAvatarUrl(friend.avatarUrl) && (
                                <span>{initial}</span>
                              )}
                            </div>
                            <div className={styles.friendInfo}>
                              <p
                                className={styles.friendName}
                                style={getDisplayNameTextStyle(friend, messagesShellTheme)}
                              >
                                {friend.displayName || friend.username}
                              </p>
                              <p className={styles.friendStatus}>
                                {(() => {
                                  const st = (presenceByUserId as any)?.[friend._id] as string | undefined;
                                  if (st === "online") return t("chat.presence.online");
                                  if (st === "idle") return t("chat.presence.idle");
                                  return t("chat.presence.offline");
                                })()}
                              </p>
                            </div>
                            {(dmUnreadCounts[friend._id] ?? 0) > 0 && (
                              <span className={styles.friendUnreadWrap}>
                                <span className={styles.dmUnreadDot} aria-hidden />
                                <span className={styles.dmUnreadBadge}>
                                  {dmUnreadCounts[friend._id]! > 99 ? "99+" : dmUnreadCounts[friend._id]}
                                </span>
                              </span>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div
                        style={{
                          padding: "20px 16px",
                          textAlign: "center",
                          color: "var(--color-text-muted)",
                          fontSize: "14px",
                        }}
                      ></div>
                    )}
                  </div>
                </div>
                </div>

                {/* Voice Controls Footer - cùng vị trí như bên server */}
                <div className={styles.voiceControls}>
                  {/* User Info */}
                  <div className={styles.userInfoSection}>
                    <div
                      className={styles.userAvatar}
                      style={{
                        backgroundImage: isValidAvatarUrl(
                          currentUserProfile?.avatarUrl,
                        )
                          ? `url(${currentUserProfile.avatarUrl})`
                          : undefined,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    >
                      {!isValidAvatarUrl(currentUserProfile?.avatarUrl) && (
                        <span>
                          {currentUserProfile?.displayName
                            ?.charAt(0)
                            ?.toUpperCase() ||
                            currentUserProfile?.username
                              ?.charAt(0)
                              ?.toUpperCase() ||
                            "U"}
                        </span>
                      )}
                      <div className={styles.onlineStatus}></div>
                    </div>
                    <div className={styles.userTextInfo}>
                      <div
                        className={styles.userDisplayName}
                        style={getDisplayNameTextStyle(currentUserProfile, messagesShellTheme)}
                      >
                        {currentUserProfile?.displayName ||
                          currentUserProfile?.username ||
                          t("chat.messagesPage.userFallback")}
                      </div>
                      <div className={styles.userUsername}>
                        {currentUserProfile?.username || ""}
                      </div>
                    </div>
                  </div>

                  {/* Voice Controls */}
                  <div className={styles.voiceButtons}>
                    <button
                      type="button"
                      className={`${styles.voiceButton} ${voiceMicMuted ? styles.voiceButtonMuted : ""}`}
                      title={voiceMicMuted ? t("chat.messagesPage.micOn") : t("chat.messagesPage.micOff")}
                      onClick={() => {
                        const next = !voiceMicMuted;
                        setVoiceMicMuted(next);
                        if (voiceMuteKey) {
                          setVoiceMuteByChannel((prev) => ({
                            ...prev,
                            [voiceMuteKey]: {
                              micMuted: next,
                              soundMuted: prev[voiceMuteKey]?.soundMuted ?? false,
                            },
                          }));
                        }
                      }}
                      aria-pressed={voiceMicMuted}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                        <line x1="12" y1="19" x2="12" y2="23"></line>
                        <line x1="8" y1="23" x2="16" y2="23"></line>
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={`${styles.voiceButton} ${voiceSoundMuted ? styles.voiceButtonMuted : ""}`}
                      title={voiceSoundMuted ? t("chat.messagesPage.soundOn") : t("chat.messagesPage.soundOff")}
                      onClick={() => {
                        const next = !voiceSoundMuted;
                        setVoiceSoundMuted(next);
                        if (voiceMuteKey) {
                          setVoiceMuteByChannel((prev) => ({
                            ...prev,
                            [voiceMuteKey]: {
                              micMuted: prev[voiceMuteKey]?.micMuted ?? false,
                              soundMuted: next,
                            },
                          }));
                        }
                      }}
                      aria-pressed={voiceSoundMuted}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                        <path d="M15.54 8.46a7 7 0 0 1 0 9.9"></path>
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              // Server Selected - Header (tên máy chủ + mời) + Sự kiện + Nâng cấp + Kênh Chat & Kênh đàm thoại
              <>
                <div className={styles.conversationsScrollArea}>
                {/* Server header: tên máy chủ + mời tham gia */}
                <div className={styles.serverHeader}>
                  <button
                    type="button"
                    className={styles.serverNameBtn}
                    title={currentServer?.name}
                  >
                    <span className={styles.serverNameText}>
                      {currentServer?.name || "Máy chủ"}
                    </span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={styles.inviteServerBtn}
                    title={t("chat.sidebar.inviteServer")}
                    onClick={() => {
                      if (currentServer)
                        setInviteToServerTarget({
                          serverId: currentServer._id,
                          serverName: currentServer.name || t("chat.sidebar.serverFallback"),
                        });
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                </div>
                {/* Sự kiện đang diễn ra - hiển thị bên trên Sự kiện khi đến đúng thời gian */}
                {activeServerEvents.length > 0 && (
                  <div className={styles.activeEventsBlock}>
                    {activeServerEvents.map((ev) => (
                      <div key={ev._id} className={styles.activeEventCard}>
                        <div className={styles.activeEventHeader}>
                          <span className={styles.activeEventLive}>
                            <span className={styles.activeEventDot} />
                            {t("chat.sidebar.liveEvent")}
                          </span>
                          <button
                            type="button"
                            className={styles.activeEventDismiss} 
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveServerEvents((prev) => prev.filter((x) => x._id !== ev._id));
                            }}
                            aria-label={t("chat.sidebar.closeAria")}>
                            ×
                          </button>
                        </div>
                        <div className={styles.activeEventTitle}>{ev.topic}</div>
                        <div className={styles.activeEventLocation}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          <span>
                            {currentServer?.name}
                            {ev.channelId ? ` · # ${ev.channelId.name}` : ""}
                          </span>
                        </div>
                        <button
                          type="button"
                          className={styles.activeEventDetailBtn}
                          onClick={() => setSelectedEventDetail(ev)}
                        >
                          {t("chat.sidebar.eventDetail")}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Sự Kiện - mở popup sự kiện */}
                <button
                  type="button"
                  className={styles.serverMenuItem}
                  onClick={() => {
                    setShowEventsPopup(true);
                    if (selectedServer) loadActiveEvents(selectedServer);
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span>{t("chat.sidebar.events")}</span>
                  {serverEventsTotalCount > 0 && (
                    <span className={styles.eventCountBadge}>{serverEventsTotalCount} {t("chat.sidebar.events")}</span>
                  )}
                </button>
                {/* Nâng Cấp Máy Chủ */}
                <button type="button" className={styles.serverMenuItem}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                  </svg>
                  <span>{t("chat.sidebar.boostServer")}</span>
                </button>
                {canManageJoinApplications && selectedServer && (
                  <button
                    type="button"
                    className={`${styles.serverMenuItem} ${showJoinApplicationsView ? styles.serverMenuItemActive : ""}`}
                    onClick={() => {
                      setShowExploreView(false);
                      setShowJoinApplicationsView(true);
                      setSelectedChannel(null);
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    <span>{t("chat.sidebar.members")}</span>
                    {joinAppPendingCount > 0 && (
                      <span
                        style={{
                          marginLeft: "auto",
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: "var(--color-panel-danger)",
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </button>
                )}
                {/* Thông Tin section - only shown when info channels exist */}
                {visibleChannelsIfHideMuted(infoChannels).length > 0 && (() => {
                  const infoCatId = infoChannels.find(c => c.categoryId)?.categoryId;
                  const infoCat = infoCatId ? serverCategories.find(c => c._id === infoCatId) : null;
                  const infoCollapse = infoCat ? getCategoryCollapseState(infoCat._id) : { enabled: false, collapsed: false };
                  const hideInfoChannels = infoCollapse.enabled && infoCollapse.collapsed;
                  const infoChannelsVisible = visibleChannelsIfHideMuted(infoChannels);
                  return (
                  <div className={styles.section}>
                    <div
                      className={styles.sectionHeader}
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                      onContextMenu={infoCat ? (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCategoryContextMenu({ x: e.clientX, y: e.clientY, category: { _id: infoCat._id, name: infoCat.name } });
                      } : undefined}
                    >
                      {infoCat && infoCollapse.enabled && currentUserId && selectedServer && (
                        <button
                          type="button"
                          title={infoCollapse.collapsed ? t("chat.sidebar.expandCategory") : t("chat.sidebar.collapseCategory")}
                          aria-label={infoCollapse.collapsed ? t("chat.sidebar.expand") : t("chat.sidebar.collapse")}
                          className={styles.addChannelBtn}
                          style={{ flexShrink: 0 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            sidebarPrefs.setCategoryCollapsed(
                              currentUserId,
                              selectedServer,
                              infoCat._id,
                              !infoCollapse.collapsed,
                            );
                            bumpSidebarPrefs();
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            {infoCollapse.collapsed ? <path d="M6 9l6 6 6-6" /> : <path d="M18 15l-6-6-6 6" />}
                          </svg>
                        </button>
                      )}
                      {renamingCategoryId && infoCat && renamingCategoryId === infoCat._id ? (
                        <input
                          className={styles.sectionTitle}
                          style={{ background: "var(--color-bg-input, #1e1f22)", border: "1px solid var(--color-primary)", borderRadius: "3px", padding: "0 4px", color: "inherit", font: "inherit", outline: "none", flex: 1, minWidth: 0 }}
                          autoFocus
                          value={renamingCategoryName}
                          onChange={(e) => setRenamingCategoryName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameCategory(infoCat._id, renamingCategoryName);
                            if (e.key === "Escape") { renameCancelledRef.current = true; setRenamingCategoryId(null); setRenamingCategoryName(""); }
                          }}
                          onBlur={() => { if (renameCancelledRef.current) { renameCancelledRef.current = false; return; } handleRenameCategory(infoCat._id, renamingCategoryName); }}
                        />
                      ) : (
                        <h3 className={styles.sectionTitle} style={{ flex: 1, margin: 0 }}>{infoCat?.name ?? t("chat.sidebar.infoFallback")}</h3>
                      )}
                    </div>
                    {!hideInfoChannels && infoChannelsVisible.map((channel) => (
                      <div
                        key={channel._id}
                        className={`${styles.conversationItem} ${
                          selectedChannel === channel._id ? styles.active : ""
                        }`}
                        onClick={() => trySelectChannel(channel._id)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setChannelContextMenu({ x: e.clientX, y: e.clientY, channel: { _id: channel._id, name: channel.name, isDefault: channel.isDefault }, categoryId: channel.categoryId ?? null });
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
                          {channel.isRulesChannel ? (
                            <span title={t("chat.sidebar.rulesChannel")} style={{ fontSize: "16px", flexShrink: 0 }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.7 }}>
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 9h-2v6h2v-6zm0-4h-2v2h2V7z" />
                              </svg>
                            </span>
                          ) : (
                            <span style={{ fontSize: "18px" }}>#</span>
                          )}
                          <span style={{ fontSize: "18px" }}>{translateChannelName(channel.name, language)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  );
                })()}

                {/* Dynamic categories with drag-and-drop */}
                {(() => {
                  const visibleCategories = serverCategories;
                  return visibleCategories.length > 0 ? (
                  <>
                  {visibleCategories.map((cat) => {
                    const channelsInCat = visibleChannelsIfHideMuted(getChannelsForCategory(cat._id));
                    const isVoiceCategory = cat.type === "voice";
                    const isCatDragging = dragType === "category" && dragId === cat._id;
                    const isCatDropTarget = dragType === "category" && dragOverId === cat._id && dragId !== cat._id;
                    const isChannelDropOnCat = dragType === "channel" && dragOverCategoryId === cat._id;
                    const catCollapse = getCategoryCollapseState(cat._id);
                    const hideCatChannels = catCollapse.enabled && catCollapse.collapsed;
                    return (
                      <div
                        key={cat._id}
                        className={`${styles.section} ${isCatDragging ? styles.dragging : ""}`}
                        draggable={canDragChannels}
                        onDragStart={(e) => { e.stopPropagation(); handleCategoryDragStart(e, cat._id); }}
                        onDragOver={(e) => {
                          handleCategoryDragOver(e, cat._id);
                          if (dragType === "channel") { e.preventDefault(); setDragOverCategoryId(cat._id); }
                        }}
                        onDrop={(e) => {
                          if (dragType === "category") handleCategoryDrop(e, cat._id);
                          else if (dragType === "channel") handleCategoryBodyDrop(e, cat._id);
                        }}
                        onDragEnd={handleDragEnd}
                        style={{ position: "relative" }}
                      >
                        {isCatDropTarget && dragPosition === "before" && (
                          <div className={styles.dropIndicator} style={{ top: 0 }} />
                        )}
                        <div
                          className={styles.sectionHeader}
                          style={{
                            cursor: canDragChannels ? "grab" : "default",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setCategoryContextMenu({ x: e.clientX, y: e.clientY, category: { _id: cat._id, name: cat.name } });
                          }}
                        >
                          {catCollapse.enabled && currentUserId && selectedServer && (
                            <button
                              type="button"
                              title={catCollapse.collapsed ? "Mở rộng danh mục" : "Thu gọn danh mục"}
                              aria-label={catCollapse.collapsed ? "Mở rộng" : "Thu gọn"}
                              className={styles.addChannelBtn}
                              style={{ flexShrink: 0 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                sidebarPrefs.setCategoryCollapsed(
                                  currentUserId,
                                  selectedServer,
                                  cat._id,
                                  !catCollapse.collapsed,
                                );
                                bumpSidebarPrefs();
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                {catCollapse.collapsed ? <path d="M6 9l6 6 6-6" /> : <path d="M18 15l-6-6-6 6" />}
                              </svg>
                            </button>
                          )}
                          {renamingCategoryId === cat._id ? (
                            <input
                              className={styles.sectionTitle}
                              style={{ background: "var(--color-bg-input, #1e1f22)", border: "1px solid var(--color-primary)", borderRadius: "3px", padding: "0 4px", color: "inherit", font: "inherit", outline: "none", flex: 1, minWidth: 0 }}
                              autoFocus
                              value={renamingCategoryName}
                              onChange={(e) => setRenamingCategoryName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleRenameCategory(cat._id, renamingCategoryName);
                                if (e.key === "Escape") { renameCancelledRef.current = true; setRenamingCategoryId(null); setRenamingCategoryName(""); }
                              }}
                              onBlur={() => { if (renameCancelledRef.current) { renameCancelledRef.current = false; return; } handleRenameCategory(cat._id, renamingCategoryName); }}
                            />
                          ) : (
                            <h3 className={styles.sectionTitle} style={{ flex: 1, margin: 0 }}>{translateCategoryName(cat.name, language)}</h3>
                          )}
                          <button
                            type="button"
                            className={styles.addChannelBtn}
                            title={isVoiceCategory ? t("chat.sidebar.createVoiceChannel") : t("chat.sidebar.createTextChannel")}
                            onClick={() => openCreateChannelModal(isVoiceCategory ? "voice" : "text", cat.name, cat._id)}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 5v14M5 12h14" />
                            </svg>
                          </button>
                        </div>
                        <div
                          className={styles.categoryChannelList}
                          style={{
                            display: hideCatChannels ? "none" : undefined,
                            minHeight: isChannelDropOnCat && channelsInCat.length === 0 ? "32px" : undefined,
                            background: isChannelDropOnCat && channelsInCat.length === 0 ? "var(--color-bg-hover)" : undefined,
                            borderRadius: "4px",
                            transition: "background 0.15s ease",
                          }}
                        >
                          {channelsInCat.map((channel) => {
                            const isVoice = channel.type === "voice";
                            const isSelected =
                              selectedChannel === channel._id || joinedVoiceChannelId === channel._id;
                            const isChDragging = dragType === "channel" && dragId === channel._id;
                            const isChDropTarget = dragType === "channel" && dragOverId === channel._id && dragId !== channel._id;
                            if (isVoice) {
                              const participantsInChannel = voiceChannelParticipants[channel._id] ?? [];
                              return (
                                <div
                                  key={channel._id}
                                  className={`${styles.voiceChannelWrap} ${isChDragging ? styles.dragging : ""}`}
                                  draggable={canDragChannels}
                                  onDragStart={(e) => { e.stopPropagation(); handleChannelDragStart(e, channel._id); }}
                                  onDragOver={(e) => { e.stopPropagation(); handleChannelDragOver(e, channel._id, cat._id); }}
                                  onDrop={(e) => handleChannelDrop(e, channel._id, cat._id)}
                                  onDragEnd={handleDragEnd}
                                  style={{ position: "relative" }}
                                >
                                  {isChDropTarget && dragPosition === "before" && <div className={styles.dropIndicator} style={{ top: 0 }} />}
                                  <div
                                    className={`${styles.conversationItem} ${isSelected ? styles.active : ""}`}
                                    onClick={() => trySelectChannel(channel._id)}
                                    onContextMenu={(e) => {
                                      e.preventDefault();
                                      setChannelContextMenu({ x: e.clientX, y: e.clientY, channel: { _id: channel._id, name: channel.name, isDefault: channel.isDefault }, categoryId: channel.categoryId ?? null });
                                    }}
                                  >
                                    <div className={styles.voiceChannelRow}>
                                      <span className={`${styles.voiceChannelIconSidebar} ${isSelected ? styles.voiceChannelIconActive : ""}`}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                          <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
                                          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                          <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" />
                                          <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" strokeWidth="2" />
                                        </svg>
                                      </span>
                                      <span>{translateChannelName(channel.name, language)}</span>
                                    </div>
                                  </div>
                                  {participantsInChannel.length > 0 && (
                                    <div className={styles.voiceChannelParticipants} aria-label="Người đang trong kênh thoại">
                                      <div className={styles.voiceChannelParticipantsLabel}>Đang trong kênh</div>
                                      {participantsInChannel.map((p) => (
                                        <div key={p.identity} className={styles.voiceChannelParticipant}>
                                          <div className={styles.voiceChannelParticipantAvatar} style={{ backgroundColor: "var(--color-primary)", backgroundSize: "cover", backgroundPosition: "center" }}>
                                            <span>{(p.name || "?").charAt(0).toUpperCase()}</span>
                                          </div>
                                          <span className={styles.voiceChannelParticipantName}>{p.name}</span>
                                          <div className={styles.voiceChannelParticipantIcons}>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /><line x1="2" y1="2" x2="22" y2="22" /></svg>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1v-4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v4H5a2 2 0 0 1-2-2v-5" /><line x1="2" y1="2" x2="22" y2="22" /></svg>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {isChDropTarget && dragPosition === "after" && <div className={styles.dropIndicator} style={{ bottom: 0 }} />}
                                </div>
                              );
                            }
                            return (
                              <div
                                key={channel._id}
                                className={`${styles.channelDragItem} ${isChDragging ? styles.dragging : ""}`}
                                draggable={canDragChannels}
                                onDragStart={(e) => { e.stopPropagation(); handleChannelDragStart(e, channel._id); }}
                                onDragOver={(e) => { e.stopPropagation(); handleChannelDragOver(e, channel._id, cat._id); }}
                                onDrop={(e) => handleChannelDrop(e, channel._id, cat._id)}
                                onDragEnd={handleDragEnd}
                                style={{ position: "relative" }}
                              >
                                {isChDropTarget && dragPosition === "before" && <div className={styles.dropIndicator} style={{ top: 0 }} />}
                                <div
                                  className={`${styles.conversationItem} ${isSelected ? styles.active : ""}`}
                                  onClick={() => trySelectChannel(channel._id)}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    setChannelContextMenu({ x: e.clientX, y: e.clientY, channel: { _id: channel._id, name: channel.name, isDefault: channel.isDefault }, categoryId: channel.categoryId ?? null });
                                  }}
                                  style={{ cursor: canDragChannels ? "grab" : "pointer" }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
                                    {channel.isRulesChannel ? (
                                      <span title={t("chat.sidebar.rulesChannel")} style={{ fontSize: "16px", flexShrink: 0 }}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.7 }}>
                                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 9h-2v6h2v-6zm0-4h-2v2h2V7z" />
                                        </svg>
                                      </span>
                                    ) : (
                                      <span style={{ fontSize: "18px" }}>#</span>
                                    )}
                                    <span style={{ fontSize: "18px" }}>{translateChannelName(channel.name, language)}</span>
                                  </div>
                                </div>
                                {isChDropTarget && dragPosition === "after" && <div className={styles.dropIndicator} style={{ bottom: 0 }} />}
                              </div>
                            );
                          })}
                        </div>
                        {channelsInCat.length === 0 && (
                          <div style={{ padding: "12px 16px", fontSize: "12px", color: "var(--color-text-muted)" }}>
                            {t("chat.sidebar.noChannels")}
                          </div>
                        )}
                        {isCatDropTarget && dragPosition === "after" && (
                          <div className={styles.dropIndicator} style={{ bottom: 0 }} />
                        )}
                      </div>
                    );
                  })}
                  {visibleChannelsIfHideMuted(getUncategorizedChannels()).length > 0 && (
                    <div className={styles.section}>
                      <div
                        className={styles.sectionHeader}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setCategoryContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            category: {
                              _id: UNCATEGORIZED_CATEGORY_ID,
                              name: t("chat.sidebar.otherChannels"),
                            },
                          });
                        }}
                      >
                        <h3 className={styles.sectionTitle}>{t("chat.sidebar.otherChannels")}</h3>
                      </div>
                      {visibleChannelsIfHideMuted(getUncategorizedChannels()).map((channel) => (
                        <div
                          key={channel._id}
                          className={`${styles.channelDragItem} ${dragType === "channel" && dragId === channel._id ? styles.dragging : ""}`}
                          draggable={canDragChannels}
                          onDragStart={(e) => {
                            e.stopPropagation();
                            handleChannelDragStart(e, channel._id);
                          }}
                          onDragEnd={handleDragEnd}
                          style={{ position: "relative" }}
                        >
                          <div
                            className={`${styles.conversationItem} ${selectedChannel === channel._id ? styles.active : ""}`}
                            onClick={() => trySelectChannel(channel._id)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setChannelContextMenu({
                                x: e.clientX,
                                y: e.clientY,
                                channel: { _id: channel._id, name: channel.name, isDefault: channel.isDefault },
                                categoryId: channel.categoryId ?? null,
                              });
                            }}
                            style={{ cursor: canDragChannels ? "grab" : "pointer" }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
                              {channel.type === "voice" ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0, opacity: 0.7 }}>
                                  <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
                                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                </svg>
                              ) : channel.isRulesChannel ? (
                                <span title={t("chat.sidebar.rulesChannel")} style={{ fontSize: "16px", flexShrink: 0 }}>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.7 }}>
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 9h-2v6h2v-6zm0-4h-2v2h2V7z" />
                                  </svg>
                                </span>
                              ) : (
                                <span style={{ fontSize: "18px" }}>#</span>
                              )}
                              <span style={{ fontSize: channel.type === "voice" ? "14px" : "18px" }}>{translateChannelName(channel.name, language)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  </>
                ) : (
                  <>
                    <div className={styles.section}>
                      <div className={styles.sectionHeader}>
                        <h3 className={styles.sectionTitle}>{t("chat.messagesPage.sectionChat")}</h3>
                        <button type="button" className={styles.addChannelBtn} title={t("chat.sidebar.createTextChannel")} onClick={() => openCreateChannelModal("text")}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
                        </button>
                      </div>
                      {visibleChannelsIfHideMuted(textChannels).length > 0 ? visibleChannelsIfHideMuted(textChannels).map((channel) => (
                        <div
                          key={channel._id}
                          className={`${styles.conversationItem} ${selectedChannel === channel._id ? styles.active : ""}`}
                          onClick={() => trySelectChannel(channel._id)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setChannelContextMenu({ x: e.clientX, y: e.clientY, channel: { _id: channel._id, name: channel.name, isDefault: channel.isDefault }, categoryId: channel.categoryId ?? null });
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
                            <span style={{ fontSize: "18px" }}>#{translateChannelName(channel.name, language)}</span>
                          </div>
                        </div>
                      )) : (
                        <div style={{ padding: "12px 16px", fontSize: "12px", color: "var(--color-text-muted)" }}>{t("chat.sidebar.noChatChannels")}</div>
                      )}
                    </div>
                    <div className={styles.section}>
                      <div className={styles.sectionHeader}>
                        <h3 className={styles.sectionTitle}>{t("chat.messagesPage.sectionVoice")}</h3>
                        <button type="button" className={styles.addChannelBtn} title="Tạo kênh thoại" onClick={() => openCreateChannelModal("voice")}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
                        </button>
                      </div>
                      {visibleChannelsIfHideMuted(voiceChannels).length > 0 ? visibleChannelsIfHideMuted(voiceChannels).map((channel) => (
                        <div
                          key={channel._id}
                          className={`${styles.conversationItem} ${selectedChannel === channel._id || joinedVoiceChannelId === channel._id ? styles.active : ""}`}
                          onClick={() => trySelectChannel(channel._id)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setChannelContextMenu({ x: e.clientX, y: e.clientY, channel: { _id: channel._id, name: channel.name, isDefault: channel.isDefault }, categoryId: channel.categoryId ?? null });
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0, opacity: 0.7 }}><path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
                            <span style={{ fontSize: "14px" }}>{translateChannelName(channel.name, language)}</span>
                          </div>
                        </div>
                      )) : (
                        <div style={{ padding: "12px 16px", fontSize: "12px", color: "var(--color-text-muted)" }}>{t("chat.sidebar.noVoiceChannels")}</div>
                      )}
                    </div>
                  </>
                );
                })()}
                {isAdminView && adminReturnUrl && (
                  <button
                    type="button"
                    className={styles.adminReturnBtn}
                    onClick={async () => {
                      const t = localStorage.getItem("accessToken") || "";
                      console.log("[AdminReturn] Leaving server:", adminViewServerId, "token exists:", !!t);
                      if (adminViewServerId && t) {
                        await serversApi.adminLeaveServer(adminViewServerId, t);
                      }
                      localStorage.removeItem("accessToken");
                      if (adminReturnUrl) window.location.href = adminReturnUrl;
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 12H5" />
                      <path d="M12 19l-7-7 7-7" />
                    </svg>
                    {t("chat.sidebar.goBackAdmin")}
                  </button>
                )}
                </div>{/* end conversationsScrollArea */}

                {/* Voice Controls Footer - cùng vị trí như bên DM */}
                <div className={styles.voiceControls}>
                  <div className={styles.userInfoSection}>
                    <div
                      className={styles.userAvatar}
                      style={{
                        backgroundImage: isValidAvatarUrl(
                          currentUserProfile?.avatarUrl,
                        )
                          ? `url(${currentUserProfile.avatarUrl})`
                          : undefined,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    >
                      {!isValidAvatarUrl(currentUserProfile?.avatarUrl) && (
                        <span>
                          {(currentServerNickname || currentUserProfile?.displayName)
                            ?.charAt(0)
                            ?.toUpperCase() ||
                            currentUserProfile?.username
                              ?.charAt(0)
                              ?.toUpperCase() ||
                            "U"}
                        </span>
                      )}
                      <div className={styles.onlineStatus}></div>
                    </div>
                    <div className={styles.userTextInfo}>
                      <div
                        className={styles.userDisplayName}
                        style={getDisplayNameTextStyle(currentUserProfile, messagesShellTheme)}
                      >
                        {currentServerNickname ||
                          currentUserProfile?.displayName ||
                          currentUserProfile?.username ||
                          t("chat.sidebar.userFallback")}
                      </div>
                      <div className={styles.userUsername}>
                        {currentUserProfile?.username || ""}
                      </div>
                    </div>
                  </div>
                  <div className={styles.voiceButtons}>
                    <button
                      type="button"
                      className={`${styles.voiceButton} ${voiceMicMuted ? styles.voiceButtonMuted : ""}`}
                      title={voiceMicMuted ? t("chat.messagesPage.micOn") : t("chat.messagesPage.micOff")}
                      onClick={() => {
                        const next = !voiceMicMuted;
                        setVoiceMicMuted(next);
                        if (voiceMuteKey) {
                          setVoiceMuteByChannel((prev) => ({
                            ...prev,
                            [voiceMuteKey]: {
                              micMuted: next,
                              soundMuted: prev[voiceMuteKey]?.soundMuted ?? false,
                            },
                          }));
                        }
                      }}
                      aria-pressed={voiceMicMuted}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                        <line x1="12" y1="19" x2="12" y2="23"></line>
                        <line x1="8" y1="23" x2="16" y2="23"></line>
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={`${styles.voiceButton} ${voiceSoundMuted ? styles.voiceButtonMuted : ""}`}
                      title={voiceSoundMuted ? t("chat.messagesPage.soundOn") : t("chat.messagesPage.soundOff")}
                      onClick={() => {
                        const next = !voiceSoundMuted;
                        setVoiceSoundMuted(next);
                        if (voiceMuteKey) {
                          setVoiceMuteByChannel((prev) => ({
                            ...prev,
                            [voiceMuteKey]: {
                              micMuted: prev[voiceMuteKey]?.micMuted ?? false,
                              soundMuted: next,
                            },
                          }));
                        }
                      }}
                      aria-pressed={voiceSoundMuted}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                        <path d="M15.54 8.46a7 7 0 0 1 0 9.9"></path>
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right - Chat Area & Active Now */}
        <div className={styles.rightContent}>
          {/* Chat Area */}
          <div className={styles.chatArea}>
            {currentServer &&
            !selectedDirectMessageFriend &&
            myServerAccessStatus?.accessMode === "apply" &&
            myServerAccessStatus?.status === "pending" ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
                <div
                  style={{
                    width: "min(520px, 92vw)",
                    borderRadius: 12,
                    background: "#2b2d31",
                    border: "1px solid #3f4147",
                    boxShadow: "0 16px 48px rgba(0,0,0,.45)",
                    padding: 22,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
                  <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8, color: "#f2f3f5" }}>
                    {t("chat.applyPending.title").replace("{server}", currentServer.name || t("chat.popups.inbox.serverFallback"))}
                  </div>
                  <div style={{ fontSize: 13, color: "#b5bac1", marginBottom: 18 }}>
                    {t("chat.applyPending.desc")}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await serversApi.withdrawMyJoinApplication(currentServer._id);
                        await loadServers();
                        setSelectedServer(null);
                        setSelectedChannel(null);
                      } catch (e) {
                        alert(e instanceof Error ? e.message : t("chat.applyPending.withdrawError"));
                      }
                    }}
                    style={{
                      width: "100%",
                      border: "none",
                      borderRadius: 6,
                      padding: "10px 14px",
                      background: "#ed4245",
                      color: "#fff",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    {t("chat.applyPending.withdraw")}
                  </button>
                </div>
              </div>
            ) : showExploreView && !selectedDirectMessageFriend ? (
              <ExploreServersView
                onClose={() => setShowExploreView(false)}
                onJoin={async (serverId) => {
                  try {
                    const opened = await openApplyJoinModalIfNeeded(serverId);
                    if (opened) return;
                    await serversApi.joinServer(serverId);
                    await loadServers();
                    setShowExploreView(false);
                    setSelectedServer(serverId);
                  } catch (e) {
                    alert(e instanceof Error ? e.message : t("chat.applyPending.joinError"));
                  }
                }}
              />
            ) : showBoostUpgradeView && !selectedDirectMessageFriend ? (
              <div style={{ flex: 1, display: "flex", minHeight: 0, minWidth: 0 }}>
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    overflow: "auto",
                    background:
                      "radial-gradient(900px 520px at 20% -10%, color-mix(in srgb, var(--color-primary) 20%, transparent), transparent 55%), radial-gradient(900px 520px at 80% 0%, color-mix(in srgb, var(--color-primary-strong, var(--color-primary)) 14%, transparent), transparent 60%), var(--color-bg-home)",
                    padding: 22,
                    color: "var(--color-text)",
                  }}
                >
                  <div
                    style={{
                      width: "min(1060px, 100%)",
                      margin: "0 auto",
                      borderRadius: 18,
                      border: "1px solid var(--color-border)",
                      background:
                        "linear-gradient(180deg, color-mix(in srgb, var(--color-primary) 30%, transparent), transparent)",
                      padding: "22px 18px",
                      boxShadow: "0 20px 60px rgba(2, 6, 23, 0.18)",
                      display: "grid",
                      gap: 14,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontWeight: 800 }}>
                        <button
                          type="button"
                          onClick={() => undefined}
                          style={{
                            border: "1px solid rgba(255,255,255,0.12)",
                            background: "rgba(255,255,255,0.08)",
                            color: "var(--color-text)",
                            padding: "6px 10px",
                            borderRadius: 10,
                            cursor: "pointer",
                            fontWeight: 900,
                          }}
                        >
                          {t("chat.boostStore.tabs.store")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowBoostUpgradeView(false);
                          }}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "var(--color-text-muted)",
                            padding: "6px 10px",
                            borderRadius: 10,
                            cursor: "pointer",
                            fontWeight: 800,
                          }}
                          title={t("chat.boostStore.tabs.close")}
                        >
                          {t("chat.boostStore.tabs.close")}
                        </button>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        {boostStatus?.active && boostStatus?.expiresAt ? (
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--color-text-muted)",
                              fontWeight: 800,
                              padding: "6px 10px",
                              borderRadius: 999,
                              border: "1px solid rgba(255,255,255,0.10)",
                              background: "rgba(255,255,255,0.05)",
                            }}
                            title={t("chat.boostStore.expiresLabel")}
                          >
                            {t("chat.boostStore.expiresLabel")}:{" "}
                            {(() => {
                              const d = new Date(boostStatus.expiresAt as string);
                              return Number.isFinite(d.getTime())
                                ? d.toLocaleDateString(localeTagForLanguage(language))
                                : String(boostStatus.expiresAt);
                            })()}
                          </div>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setBoostMode("gift");
                            setBoostModalStep("plan");
                            setBoostTier("boost");
                            setBoostBillingCycle("monthly");
                            setBoostRecipientUserId(null);
                            setBoostModalOpen(true);
                          }}
                          style={{
                            borderRadius: 999,
                            padding: "8px 12px",
                            fontSize: 12,
                            fontWeight: 900,
                            border: "1px solid rgba(255,255,255,0.16)",
                            background: "rgba(255,255,255,0.08)",
                            color: "var(--color-text)",
                            cursor: "pointer",
                          }}
                        >
                          {t("chat.boostStore.buttons.gift")}
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: 44,
                        fontWeight: 950,
                        textTransform: "uppercase",
                        lineHeight: 1.05,
                        letterSpacing: "0.02em",
                      }}
                    >
                      {t("chat.boostStore.heroTitle")}
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                      <button
                        type="button"
                        onClick={() => {
                          setBoostMode("subscribe");
                          setBoostModalStep("plan");
                          setBoostTier((boostStatus?.tier as any) === "basic" ? "basic" : "boost");
                          setBoostBillingCycle("monthly");
                          setBoostRecipientUserId(null);
                          setBoostModalOpen(true);
                        }}
                        style={{
                          border: "none",
                          borderRadius: 12,
                          padding: "10px 14px",
                          fontSize: 14,
                          fontWeight: 900,
                          cursor: "pointer",
                          color: "#fff",
                          background:
                            "linear-gradient(135deg, var(--color-primary), var(--color-primary-strong, var(--color-primary)))",
                        }}
                      >
                        {boostStatus?.active
                          ? t("chat.boostStore.buttons.renew")
                          : t("chat.boostStore.buttons.subscribe")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBoostMode("gift");
                          setBoostModalStep("plan");
                          setBoostTier("boost");
                          setBoostBillingCycle("monthly");
                          setBoostRecipientUserId(null);
                          setBoostModalOpen(true);
                        }}
                        style={{
                          borderRadius: 12,
                          padding: "10px 14px",
                          fontSize: 14,
                          fontWeight: 900,
                          cursor: "pointer",
                          color: "var(--color-text)",
                          background: "var(--color-surface-muted)",
                          border: "1px solid var(--color-border)",
                        }}
                      >
                        {t("chat.boostStore.buttons.gift")}
                      </button>
                    </div>
                  </div>
                </div>

                {boostModalOpen ? (
                  <>
                  <div
                    role="dialog"
                    aria-modal="true"
                    onMouseDown={(e) => {
                      if (e.target === e.currentTarget) setBoostModalOpen(false);
                    }}
                    style={{
                      position: "fixed",
                      inset: 0,
                      background: "rgba(0,0,0,0.55)",
                      display: "grid",
                      placeItems: "center",
                      padding: 24,
                      zIndex: 80,
                    }}
                  >
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      style={{
                        width: "min(780px, 96vw)",
                        borderRadius: 16,
                        border: "1px solid var(--color-border)",
                        background: "var(--color-surface)",
                        padding: 16,
                        boxShadow: "0 20px 60px rgba(2,6,23,0.35)",
                        color: "var(--color-text)",
                        display: "grid",
                        gap: 12,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ fontWeight: 950 }}>
                          {boostModalStep === "plan"
                            ? boostMode === "gift"
                              ? t("chat.boostStore.modal.giftTitle")
                              : t("chat.boostStore.modal.planTitle")
                            : t("chat.boostStore.modal.billingTitle")}
                        </div>
                        <button
                          type="button"
                          onClick={() => setBoostModalOpen(false)}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            border: "1px solid var(--color-border)",
                            background: "var(--color-surface-muted)",
                            cursor: "pointer",
                            fontSize: 20,
                            lineHeight: 1,
                            color: "var(--color-text)",
                          }}
                          aria-label="Close"
                        >
                          ×
                        </button>
                      </div>

                      {boostModalStep === "plan" ? (
                        <>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <button
                              type="button"
                              onClick={() => setBoostTier("boost")}
                              style={{
                                textAlign: "left",
                                borderRadius: 16,
                                padding: 14,
                                cursor: "pointer",
                                border:
                                  boostTier === "boost"
                                    ? "1px solid color-mix(in srgb, var(--color-primary) 60%, var(--color-border) 40%)"
                                    : "1px solid var(--color-border)",
                                background:
                                  "linear-gradient(135deg, rgba(124, 58, 237, 0.12), rgba(34, 211, 238, 0.08))",
                              }}
                            >
                              <div style={{ fontSize: 30, fontWeight: 950, marginBottom: 6 }}>
                                {t("chat.boostStore.plans.boost.name")}
                              </div>
                              <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                                {t("chat.boostStore.plans.boost.priceMonthly")}
                              </div>
                              <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.45 }}>
                                <li>{t("chat.boostStore.plans.boost.feature1")}</li>
                                <li>{t("chat.boostStore.plans.boost.feature2")}</li>
                                <li>{t("chat.boostStore.plans.boost.feature3")}</li>
                                <li>{t("chat.boostStore.plans.boost.feature4")}</li>
                                <li>{t("chat.boostStore.plans.boost.feature5")}</li>
                              </ul>
                            </button>

                            <button
                              type="button"
                              onClick={() => setBoostTier("basic")}
                              style={{
                                textAlign: "left",
                                borderRadius: 16,
                                padding: 14,
                                cursor: "pointer",
                                border:
                                  boostTier === "basic"
                                    ? "1px solid color-mix(in srgb, var(--color-primary) 60%, var(--color-border) 40%)"
                                    : "1px solid var(--color-border)",
                                background:
                                  "linear-gradient(135deg, rgba(124, 58, 237, 0.12), rgba(34, 211, 238, 0.08))",
                              }}
                            >
                              <div style={{ fontSize: 26, fontWeight: 950, marginBottom: 6 }}>
                                {t("chat.boostStore.plans.basic.name")}
                              </div>
                              <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                                {t("chat.boostStore.plans.basic.priceMonthly")}
                              </div>
                              <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.45 }}>
                                <li>{t("chat.boostStore.plans.basic.feature1")}</li>
                                <li>{t("chat.boostStore.plans.basic.feature2")}</li>
                                <li>{t("chat.boostStore.plans.basic.feature3")}</li>
                              </ul>
                            </button>
                          </div>

                          {boostMode === "gift" ? (
                            <div style={{ display: "grid", gap: 10 }}>
                              <input
                                value={boostUserQuery}
                                onChange={(e) => setBoostUserQuery(e.target.value)}
                                placeholder={t("chat.boostStore.giftSearchPlaceholder")}
                                style={{
                                  width: "100%",
                                  borderRadius: 12,
                                  border: "1px solid var(--color-border)",
                                  background: "var(--color-surface)",
                                  padding: "10px 12px",
                                  fontSize: 14,
                                  color: "var(--color-text)",
                                }}
                              />

                              <div
                                style={{
                                  maxHeight: 240,
                                  overflow: "auto",
                                  display: "grid",
                                  gap: 8,
                                }}
                              >
                                {(boostUsers || [])
                                  .filter((u) => {
                                    const q = boostUserQuery.trim().toLowerCase();
                                    if (!q) return true;
                                    const a = String(u?.username ?? "").toLowerCase();
                                    const b = String(u?.displayName ?? "").toLowerCase();
                                    return a.includes(q) || b.includes(q);
                                  })
                                  .map((u) => {
                                    const id = String(u?.userId ?? u?._id ?? "");
                                    const active = id && id === boostRecipientUserId;
                                    const display =
                                      u?.displayName ||
                                      u?.username ||
                                      t("chat.boostStore.userFallback");
                                    const sub = u?.username ? `@${u.username}` : id;
                                    return (
                                      <button
                                        key={id || sub}
                                        type="button"
                                        onClick={() => setBoostRecipientUserId(id || null)}
                                        style={{
                                          width: "100%",
                                          textAlign: "left",
                                          borderRadius: 12,
                                          padding: "10px 12px",
                                          cursor: "pointer",
                                          border: active
                                            ? "1px solid color-mix(in srgb, var(--color-primary) 60%, var(--color-border) 40%)"
                                            : "1px solid var(--color-border)",
                                          background: "var(--color-surface)",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          gap: 10,
                                        }}
                                      >
                                        <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
                                          <span style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {display}
                                          </span>
                                          <span style={{ fontSize: 12, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {sub}
                                          </span>
                                        </span>
                                        <span>{active ? "✓" : ""}</span>
                                      </button>
                                    );
                                  })}
                              </div>
                            </div>
                          ) : null}

                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                            <button
                              type="button"
                              onClick={() => setBoostModalOpen(false)}
                              style={{
                                borderRadius: 12,
                                padding: "10px 14px",
                                fontSize: 14,
                                fontWeight: 900,
                                cursor: "pointer",
                                color: "var(--color-text)",
                                background: "var(--color-surface-muted)",
                                border: "1px solid var(--color-border)",
                              }}
                            >
                              {t("chat.boostStore.actions.cancel")}
                            </button>
                            <button
                              type="button"
                              disabled={boostMode === "gift" && !boostRecipientUserId}
                              onClick={goToBoostBillingStep}
                              style={{
                                border: "none",
                                borderRadius: 12,
                                padding: "10px 14px",
                                fontSize: 14,
                                fontWeight: 900,
                                cursor: "pointer",
                                color: "#fff",
                                background:
                                  "linear-gradient(135deg, var(--color-primary), var(--color-primary-strong, var(--color-primary)))",
                                opacity: boostMode === "gift" && !boostRecipientUserId ? 0.5 : 1,
                              }}
                            >
                              {t("chat.boostStore.actions.continue")}
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <button
                              type="button"
                              onClick={() => setBoostBillingCycle("monthly")}
                              style={{
                                textAlign: "left",
                                borderRadius: 16,
                                padding: 14,
                                cursor: "pointer",
                                border:
                                  boostBillingCycle === "monthly"
                                    ? "1px solid color-mix(in srgb, var(--color-primary) 60%, var(--color-border) 40%)"
                                    : "1px solid var(--color-border)",
                                background:
                                  "linear-gradient(135deg, rgba(124, 58, 237, 0.12), rgba(34, 211, 238, 0.08))",
                              }}
                            >
                              <div style={{ fontSize: 22, fontWeight: 950, marginBottom: 6 }}>
                                {t("chat.boostStore.billing.monthlyTitle")}
                              </div>
                              <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                                {t("chat.boostStore.billing.monthlySubtitle")}
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => setBoostBillingCycle("yearly")}
                              style={{
                                textAlign: "left",
                                borderRadius: 16,
                                padding: 14,
                                cursor: "pointer",
                                border:
                                  boostBillingCycle === "yearly"
                                    ? "1px solid color-mix(in srgb, var(--color-primary) 60%, var(--color-border) 40%)"
                                    : "1px solid var(--color-border)",
                                background:
                                  "linear-gradient(135deg, rgba(124, 58, 237, 0.12), rgba(34, 211, 238, 0.08))",
                              }}
                            >
                              <div style={{ fontSize: 22, fontWeight: 950, marginBottom: 6 }}>
                                {t("chat.boostStore.billing.yearlyTitle")}
                              </div>
                              <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                                {t("chat.boostStore.billing.yearlySubtitle")}
                              </div>
                            </button>
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                            <button
                              type="button"
                              onClick={() => setBoostModalStep("plan")}
                              style={{
                                borderRadius: 12,
                                padding: "10px 14px",
                                fontSize: 14,
                                fontWeight: 900,
                                cursor: "pointer",
                                color: "var(--color-text)",
                                background: "var(--color-surface-muted)",
                                border: "1px solid var(--color-border)",
                              }}
                            >
                              {t("chat.boostStore.actions.back")}
                            </button>
                            <button
                              type="button"
                              disabled={boostCheckoutBusy}
                              onClick={() => void submitMessagesBoostCheckout()}
                              style={{
                                border: "none",
                                borderRadius: 12,
                                padding: "10px 14px",
                                fontSize: 14,
                                fontWeight: 900,
                                cursor: boostCheckoutBusy ? "wait" : "pointer",
                                color: "#fff",
                                background:
                                  "linear-gradient(135deg, var(--color-primary), var(--color-primary-strong, var(--color-primary)))",
                                opacity: boostCheckoutBusy ? 0.65 : 1,
                              }}
                            >
                              {boostCheckoutBusy
                                ? t("chat.boostStore.checkout.redirecting")
                                : t("chat.boostStore.checkout.cta")}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {boostActivePeriodWarnOpen ? (
                    <div
                      role="dialog"
                      aria-modal="true"
                      onMouseDown={(e) => {
                        if (e.target === e.currentTarget)
                          setBoostActivePeriodWarnOpen(false);
                      }}
                      style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0,0,0,0.45)",
                        display: "grid",
                        placeItems: "center",
                        padding: 24,
                        zIndex: 90,
                      }}
                    >
                      <div
                        onMouseDown={(e) => e.stopPropagation()}
                        style={{
                          width: "min(440px, 92vw)",
                          borderRadius: 14,
                          border: "1px solid var(--color-border)",
                          background: "var(--color-surface)",
                          padding: 16,
                          boxShadow: "0 16px 48px rgba(2,6,23,0.4)",
                          display: "grid",
                          gap: 12,
                          color: "var(--color-text)",
                        }}
                      >
                        <div style={{ fontWeight: 950, fontSize: 16 }}>
                          {t("chat.boostStore.warnings.activeTitle")}
                        </div>
                        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--color-text-muted)" }}>
                          {t("chat.boostStore.warnings.activeBodyPrefix")}
                          {boostStatus?.expiresAt
                            ? ` đến ${new Date(boostStatus.expiresAt).toLocaleString(localeTagForLanguage(language), {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}`
                            : ""}
                          . {t("chat.boostStore.warnings.activeBodySuffix")}
                        </p>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                          <button
                            type="button"
                            onClick={() => setBoostActivePeriodWarnOpen(false)}
                            style={{
                              borderRadius: 12,
                              padding: "10px 14px",
                              fontSize: 14,
                              fontWeight: 900,
                              cursor: "pointer",
                              color: "var(--color-text)",
                              background: "var(--color-surface-muted)",
                              border: "1px solid var(--color-border)",
                            }}
                          >
                            {t("chat.boostStore.actions.abort")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setBoostActivePeriodWarnOpen(false);
                              setBoostModalStep("billing");
                            }}
                            style={{
                              border: "none",
                              borderRadius: 12,
                              padding: "10px 14px",
                              fontSize: 14,
                              fontWeight: 900,
                              cursor: "pointer",
                              color: "#fff",
                              background:
                                "linear-gradient(135deg, var(--color-primary), var(--color-primary-strong, var(--color-primary)))",
                            }}
                          >
                            {t("chat.boostStore.actions.continue")}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {boostTierSwitchWarnOpen ? (
                    <div
                      role="dialog"
                      aria-modal="true"
                      onMouseDown={(e) => {
                        if (e.target === e.currentTarget)
                          setBoostTierSwitchWarnOpen(false);
                      }}
                      style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0,0,0,0.45)",
                        display: "grid",
                        placeItems: "center",
                        padding: 24,
                        zIndex: 91,
                      }}
                    >
                      <div
                        onMouseDown={(e) => e.stopPropagation()}
                        style={{
                          width: "min(460px, 92vw)",
                          borderRadius: 14,
                          border: "1px solid var(--color-border)",
                          background: "var(--color-surface)",
                          padding: 16,
                          boxShadow: "0 16px 48px rgba(2,6,23,0.4)",
                          display: "grid",
                          gap: 12,
                          color: "var(--color-text)",
                        }}
                      >
                        <div style={{ fontWeight: 950, fontSize: 16 }}>
                          {t("chat.boostStore.warnings.switchTitle")}
                        </div>
                        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "var(--color-text-muted)" }}>
                          {t("chat.boostStore.warnings.switchBodyPrefix")}{" "}
                          <strong style={{ color: "var(--color-text)" }}>
                            {boostStatus?.tier === "basic"
                              ? t("chat.boostStore.plans.basic.name")
                              : boostStatus?.tier === "boost"
                                ? t("chat.boostStore.plans.boost.name")
                                : t("chat.boostStore.warnings.switchCurrentFallback")}
                          </strong>{" "}
                          {t("chat.boostStore.warnings.switchBodyMiddle")}{" "}
                          <strong style={{ color: "var(--color-text)" }}>
                            {boostTier === "basic"
                              ? t("chat.boostStore.plans.basic.name")
                              : t("chat.boostStore.plans.boost.name")}
                          </strong>
                          . {t("chat.boostStore.warnings.switchBodySuffix")}{" "}
                          <strong>{t("chat.boostStore.warnings.switchBodyStrong")}</strong>.
                        </p>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                          <button
                            type="button"
                            onClick={() => setBoostTierSwitchWarnOpen(false)}
                            style={{
                              borderRadius: 12,
                              padding: "10px 14px",
                              fontSize: 14,
                              fontWeight: 900,
                              cursor: "pointer",
                              color: "var(--color-text)",
                              background: "var(--color-surface-muted)",
                              border: "1px solid var(--color-border)",
                            }}
                          >
                            {t("chat.boostStore.actions.abort")}
                          </button>
                          <button
                            type="button"
                            disabled={boostCheckoutBusy}
                            onClick={() =>
                              void submitMessagesBoostCheckout({
                                skipTierChangeConfirm: true,
                              })
                            }
                            style={{
                              border: "none",
                              borderRadius: 12,
                              padding: "10px 14px",
                              fontSize: 14,
                              fontWeight: 900,
                              cursor: boostCheckoutBusy ? "wait" : "pointer",
                              color: "#fff",
                              background:
                                "linear-gradient(135deg, var(--color-primary), var(--color-primary-strong, var(--color-primary)))",
                              opacity: boostCheckoutBusy ? 0.65 : 1,
                            }}
                          >
                            {boostCheckoutBusy
                              ? t("chat.boostStore.checkout.redirecting")
                              : t("chat.boostStore.actions.continue")}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  </>
                ) : null}
              </div>
            ) : showJoinApplicationsView && currentServer && !selectedDirectMessageFriend ? (
              <div style={{ flex: 1, display: "flex", minHeight: 0, minWidth: 0 }}>
                <ServerJoinApplicationsPanel
                  serverId={currentServer._id}
                  serverName={currentServer.name || "Máy chủ"}
                  canBan={Boolean(currentServerPermissions?.canBan)}
                  canKick={Boolean(currentServerPermissions?.canKick)}
                  canTimeout={Boolean(currentServerPermissions?.canTimeout)}
                  ownerId={String((currentServer as any).ownerId?._id ?? (currentServer as any).ownerId ?? "")}
                  onApplicationsChanged={() => setJoinApplicationsRefreshTick((t) => t + 1)}
                  onViewProfile={(userId) => {
                    const existing = friends.find((f) => f._id === userId);
                    const friend: serversApi.Friend = existing ?? {
                      _id: userId,
                      displayName: "",
                      username: "",
                      avatarUrl: "",
                      email: "",
                    };
                    if (!existing) setFriends((prev) => (prev.some((f) => f._id === userId) ? prev : [...prev, friend]));
                    setSelectedDirectMessageFriend(friend);
                    setSelectedServer(null);
                    setSelectedChannel(null);
                    loadDirectMessages(userId);
                  }}
                  onSendMessage={(userId) => {
                    const existing = friends.find((f) => f._id === userId);
                    const friend: serversApi.Friend = existing ?? {
                      _id: userId,
                      displayName: "",
                      username: "",
                      avatarUrl: "",
                      email: "",
                    };
                    if (!existing) setFriends((prev) => (prev.some((f) => f._id === userId) ? prev : [...prev, friend]));
                    setSelectedDirectMessageFriend(friend);
                    setSelectedServer(null);
                    setSelectedChannel(null);
                    loadDirectMessages(userId);
                  }}
                />
              </div>
            ) : (selectedChannel && currentServer) ||
            selectedDirectMessageFriend ? (
              <>
                {connectedVoiceChannel && (
                  <>
                    {viewingVoiceChannel && (
                  <div className={styles.chatHeader}>
                    <div className={styles.channelHeaderStart}>
                      <span className={styles.voiceChannelIcon}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                          <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" />
                          <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      </span>
                      <h2 className={styles.chatHeaderTitle}>
                        {translateChannelName(connectedVoiceChannel.name, language)}
                      </h2>
                    </div>
                    <div className={styles.chatHeaderActions}>
                      <button type="button" title={t("chat.composer.voiceHeaderChat")}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                    )}
                  <div
                    className={
                      viewingVoiceChannel ? styles.voiceCallView : styles.voiceCallOffscreen
                    }
                  >
                    <div className={styles.voiceCallVideoArea}>
                      {voiceChannelCallError ? (
                        <div className={styles.voiceCallError}>
                          <p>{voiceChannelCallError}</p>
                          <button
                            type="button"
                            className={styles.voiceCallErrorBtn}
                            onClick={leaveVoiceChannel}
                          >
                            {t("chat.voice.leaveChannel")}
                          </button>
                        </div>
                      ) : voiceChannelCallToken && voiceChannelCallServerUrl ? (
                        <VoiceChannelCall
                          token={voiceChannelCallToken}
                          serverUrl={voiceChannelCallServerUrl}
                          micMuted={voiceMicMuted}
                          soundMuted={voiceSoundMuted}
                          participantName={
                            currentUserProfile?.displayName ||
                            currentUserProfile?.username ||
                            t("chat.sidebar.userFallback")
                          }
                          onDisconnect={leaveVoiceChannel}
                        />
                      ) : (
                        <div className={styles.voiceCallConnecting}>
                          <div className={styles.voiceCallSpinner} />
                          <p>{t("chat.voice.connecting")}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  </>
                )}
                {(selectedDirectMessageFriend ||
                  (selectedChatTextChannel && !viewingVoiceChannel)) && (
              <>
                {joinedVoiceChannelId && connectedVoiceChannel && !viewingVoiceChannel && (
                  <div className={styles.voiceChatBanner}>
                    <span className={styles.voiceChatBannerLabel}>
                      {t("chat.voice.inVoiceChannelBanner")} {translateChannelName(connectedVoiceChannel.name, language)}
                    </span>
                    <button type="button" className={styles.voiceChatBannerLeave} onClick={leaveVoiceChannel}>
                      {t("chat.voice.leaveChannel")}
                    </button>
                  </div>
                )}
                {/* Chat Header (DM or text channel) */}
                <div className={styles.chatHeader}>
                  <div className={styles.channelHeaderStart}>
                    <h2 className={styles.chatHeaderTitle}>
                      {selectedDirectMessageFriend
                        ? selectedDirectMessageFriend.displayName ||
                          selectedDirectMessageFriend.username
                        : `#${translateChannelName(
                            allChannels.find((c) => c._id === selectedChannel)?.name ??
                              "channel",
                            language,
                          )}`}
                    </h2>
                  </div>
                  <div className={styles.chatHeaderActions}>
                    {/* Only show call buttons for DM conversations */}
                    {selectedDirectMessageFriend && (
                      <>
                        <button
                          type="button"
                          title={t("chat.composer.voiceCall")}
                          onClick={() => handleStartCall(false)}
                          disabled={isInCall}
                        >
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                          </svg>
                        </button>
                        <button
                          type="button"
                          title={t("chat.composer.videoCall")}
                          onClick={() => handleStartCall(true)}
                          disabled={isInCall}
                        >
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <polygon points="23 7 16 12 23 17 23 7"></polygon>
                            <rect
                              x="1"
                              y="5"
                              width="15"
                              height="14"
                              rx="2"
                              ry="2"
                            ></rect>
                          </svg>
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      title={t("chat.popups.messageSearch.title")}
                      aria-label={t("chat.popups.messageSearch.title")}
                      onClick={() => {
                        setMessageSearchDmConversationOnly(Boolean(selectedDirectMessageFriend));
                        setShowMessageSearch(true);
                      }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                    </button>
                  </div>
                </div>
                {!selectedDirectMessageFriend &&
                  selectedServer &&
                  myServerAccessStatus?.showAgeRestrictedChannelNotice &&
                  !myServerAccessStatus?.chatViewBlocked && (
                    <div
                      style={{
                        flexShrink: 0,
                        padding: "8px 16px",
                        fontSize: 13,
                        lineHeight: 1.4,
                        color: "#faa61a",
                        background: "rgba(250, 166, 26, 0.12)",
                        borderBottom: "1px solid rgba(250, 166, 26, 0.25)",
                      }}
                    >
                      {t("chat.ageRestrict.bannerNotice")}
                    </div>
                  )}
                {/* Sticky reaction bar (DM): hiện reaction của tin nhắn khi kéo lên gần header */}
                {/* Messages Container */}
                <div
                  ref={messagesContainerRef}
                  className={styles.messagesContainer}
                  style={{ position: "relative" }}
                  onScroll={(e) => {
                    const container = e.currentTarget;
                    const isNearBottom =
                      container.scrollHeight -
                        container.scrollTop -
                        container.clientHeight <
                      100;
                    shouldAutoScrollRef.current = isNearBottom;
                  }}
                >
                  {!selectedDirectMessageFriend &&
                    selectedServer &&
                    myServerAccessStatus?.chatBlockReason === "age_under_18" && (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          zIndex: 40,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "rgba(15, 16, 20, 0.94)",
                          padding: 24,
                        }}
                      >
                        <div
                          style={{
                            maxWidth: 440,
                            textAlign: "center",
                            background: "var(--color-panel-bg)",
                            border: "1px solid var(--color-panel-border)",
                            borderRadius: 12,
                            padding: "28px 24px",
                            boxShadow: "0 16px 48px rgba(0,0,0,.45)",
                          }}
                        >
                          <h3 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
                            {t("chat.ageRestrict.title")}
                          </h3>
                          <p
                            style={{
                              marginTop: 12,
                              color: "var(--color-panel-text-muted)",
                              fontSize: 14,
                              lineHeight: 1.5,
                            }}
                          >
                            {t("chat.ageRestrict.under18Body")}
                          </p>
                          <button
                            type="button"
                            onClick={() => setSelectedChannel(null)}
                            style={{
                              marginTop: 20,
                              padding: "10px 20px",
                              borderRadius: 6,
                              border: "none",
                              fontWeight: 700,
                              cursor: "pointer",
                              background: "var(--color-panel-accent)",
                              color: "#fff",
                            }}
                          >
                            {t("chat.ageRestrict.goBack")}
                          </button>
                        </div>
                      </div>
                    )}
                  {!selectedDirectMessageFriend &&
                    selectedServer &&
                    myServerAccessStatus?.chatBlockReason === "age_ack" && (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          zIndex: 40,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "rgba(15, 16, 20, 0.94)",
                          padding: 24,
                        }}
                      >
                        <div
                          style={{
                            maxWidth: 440,
                            textAlign: "center",
                            background: "var(--color-panel-bg)",
                            border: "1px solid var(--color-panel-border)",
                            borderRadius: 12,
                            padding: "28px 24px",
                            boxShadow: "0 16px 48px rgba(0,0,0,.45)",
                          }}
                        >
                          <h3 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
                            {t("chat.ageRestrict.title")}
                          </h3>
                          <p
                            style={{
                              marginTop: 12,
                              color: "var(--color-panel-text-muted)",
                              fontSize: 14,
                              lineHeight: 1.5,
                            }}
                          >
                            {t("chat.ageRestrict.ackBody")}
                          </p>
                          <div
                            style={{
                              marginTop: 22,
                              display: "flex",
                              gap: 12,
                              justifyContent: "center",
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => setSelectedChannel(null)}
                              disabled={ageAcknowledgeLoading}
                              style={{
                                padding: "10px 18px",
                                borderRadius: 6,
                                border: "1px solid var(--color-panel-border)",
                                fontWeight: 700,
                                cursor: ageAcknowledgeLoading ? "not-allowed" : "pointer",
                                background: "transparent",
                                color: "var(--color-text)",
                              }}
                            >
                              {t("chat.ageRestrict.goBack")}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleAgeAcknowledgeContinue()}
                              disabled={ageAcknowledgeLoading}
                              style={{
                                padding: "10px 18px",
                                borderRadius: 6,
                                border: "none",
                                fontWeight: 700,
                                cursor: ageAcknowledgeLoading ? "not-allowed" : "pointer",
                                background: "var(--color-panel-accent)",
                                color: "#fff",
                              }}
                            >
                              {ageAcknowledgeLoading ? t("chat.ageRestrict.processing") : t("chat.ageRestrict.continue")}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  {selectedDirectMessageFriend ? (
                    loadingDirectMessages ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          height: "100%",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        <p>{t("chat.loadingMessages")}</p>
                      </div>
                    ) : (
                        conversations.get(selectedDirectMessageFriend._id) || []
                      ).length === 0 ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          height: "100%",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        <p>{t("chat.noMessages")}</p>
                      </div>
                    ) : (
                      (
                        conversations.get(selectedDirectMessageFriend._id) || []
                      ).map((message) => (
                        <div
                          key={message.id}
                          data-message-id={message.id}
                          data-has-reactions={message.reactions?.length ? "true" : undefined}
                        >
                          <MessageItem
                            message={message}
                            renderMessageContent={renderMessageContent}
                            onVisible={handleMessageVisible}
                            currentUserId={currentUserId}
                            onReaction={handleReaction}
                            onReply={handleReplyToMessage}
                            onPin={handlePinMessage}
                            onReport={(msgId) => setShowReportDialog(msgId)}
                            onDelete={(msgId) => setShowDeleteDialog(msgId)}
                            scrollContainerRef={messagesContainerRef}
                            dmPartnerDisplayName={selectedDirectMessageFriend.displayName || selectedDirectMessageFriend.username}
                          />
                        </div>
                      ))
                    )
                  ) : loading ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        height: "100%",
                        color: "var(--color-text-muted)",
                      }}
                    >
                      <p>{t("chat.loadingMessages")}</p>
                    </div>
                  ) : (
                    <>
                      {serverInteractionSettings?.welcomeMessageEnabled &&
                        selectedChannel === serverInteractionSettings?.systemChannelId &&
                        currentServer && (
                        <div style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "stretch",
                          alignSelf: "stretch",
                          width: "100%",
                          padding: "48px 16px 24px",
                          textAlign: "left",
                          borderBottom: "1px solid var(--color-border)",
                          marginBottom: 8,
                        }}>
                          <h1 style={{
                            fontSize: 28,
                            fontWeight: 700,
                            color: "var(--color-text)",
                            lineHeight: 1.3,
                            margin: 0,
                            textAlign: "left",
                          }}>
                            {t("chat.welcome.title")}
                            <br />
                            {t("chat.welcome.serverOf").replace("{name}", currentServer.name)}
                          </h1>
                          <p style={{
                            fontSize: 14,
                            color: "var(--color-text-muted)",
                            marginTop: 8,
                            maxWidth: 560,
                            textAlign: "left",
                          }}>
                            {t("chat.welcome.channelBegin")}{" "}
                            <strong style={{ color: "var(--color-text)" }}>
                              #
                              {translateChannelName(
                                allChannels.find((c) => c._id === selectedChannel)?.name ??
                                  "chung",
                                language,
                              )}
                            </strong>
                            {t("chat.welcome.startTalking")}
                          </p>
                          {/* Welcome messages: nằm dưới phần chào mừng, không bị trôi theo chat */}
                          <div style={{
                            width: "100%",
                            maxWidth: "100%",
                            marginTop: 14,
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            textAlign: "left",
                            alignSelf: "flex-start",
                          }}>
                            {messages
                              .filter((m) => m.messageType === "welcome")
                              .slice()
                              .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
                              .map((m) => (
                                <div key={m.id} data-message-id={m.id}>
                                  {renderMessageContent(m)}
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                      {messages.length === 0 &&
                        !(serverInteractionSettings?.welcomeMessageEnabled &&
                          selectedChannel === serverInteractionSettings?.systemChannelId) ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            height: "100%",
                            color: "var(--color-text-muted)",
                          }}
                        >
                          <p>{t("chat.noMessages")}</p>
                        </div>
                      ) : (
                    messages
                      .filter((m) => m.messageType !== "welcome")
                      .map((message) => {
                      if (message.messageType === "system") {
                        return (
                          <div key={message.id} data-message-id={message.id}>
                            {renderMessageContent(message)}
                          </div>
                        );
                      }
                      return (
                        <div
                          key={message.id}
                          data-message-id={message.id}
                          data-has-reactions={message.reactions?.length ? "true" : undefined}
                        >
                          <MessageItem
                            message={message}
                            renderMessageContent={renderMessageContent}
                            onVisible={handleMessageVisible}
                            currentUserId={currentUserId}
                            onReaction={handleReaction}
                            onReply={handleReplyToMessage}
                            onPin={handlePinMessage}
                            onReport={(msgId) => setShowReportDialog(msgId)}
                            onDelete={(msgId) => setShowDeleteDialog(msgId)}
                            scrollContainerRef={messagesContainerRef}
                            senderColor={memberRoleColors[message.senderId]}
                            senderNameStyle={resolveMessageSenderStyle(message)}
                            onChannelUserProfileOpen={handleOpenChannelUserProfile}
                          />
                        </div>
                      );
                    })
                      )}
                    </>
                  )}

                  {/* ✅ Typing Indicator */}
                  {selectedDirectMessageFriend &&
                    userTyping &&
                    userTyping.fromUserId === selectedDirectMessageFriend._id &&
                    userTyping.isTyping && (
                      <div className={styles.typingIndicator}>
                        <div className={styles.typingAvatar}>
                          {isValidAvatarUrl(
                            selectedDirectMessageFriend.avatarUrl,
                          ) ? (
                            <img
                              src={selectedDirectMessageFriend.avatarUrl}
                              alt={selectedDirectMessageFriend.username}
                            />
                          ) : (
                            <div className={styles.avatarPlaceholder}>
                              {(
                                selectedDirectMessageFriend.username ||
                                selectedDirectMessageFriend.displayName ||
                                "?"
                              )
                                .charAt(0)
                                .toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className={styles.typingBubble}>
                          <span className={styles.typingText}>
                            {userTyping.username ||
                              selectedDirectMessageFriend.username ||
                              selectedDirectMessageFriend.displayName}{" "}
                            is typing...
                          </span>
                          <div className={styles.typingDots}>
                            <span></span>
                            <span></span>
                            <span></span>
                          </div>
                        </div>
                      </div>
                    )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Reply Preview */}
                {replyingTo && (
                  <ReplyMessagePreview
                    message={replyingTo}
                    headerText={
                      replyingTo.isFromCurrentUser
                        ? "Bạn đã trả lời chính mình"
                        : `Bạn đã trả lời ${
                            selectedDirectMessageFriend?.displayName ||
                            replyingTo.senderDisplayName ||
                            replyingTo.senderName ||
                            replyingTo.senderEmail ||
                            "người dùng"
                          }`
                    }
                    onClose={() => setReplyingTo(null)}
                  />
                )}

                {!selectedDirectMessageFriend &&
                  selectedServer &&
                  shouldBlockServerChatInput && (
                    <div
                      style={{
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 14,
                        padding: "12px 16px",
                        background: "#1e1f22",
                        borderTop: "1px solid var(--color-border, #2b2d31)",
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontSize: 14,
                          lineHeight: 1.45,
                          color: "#dbdee1",
                          flex: 1,
                        }}
                      >
                        Bạn phải hoàn thành thêm một vài bước nữa trước khi có thể trò chuyện trong máy chủ này
                      </p>
                      <button
                        type="button"
                        onClick={() => void openVerificationRulesModal()}
                        style={{
                          flexShrink: 0,
                          border: "none",
                          borderRadius: 4,
                          padding: "8px 16px",
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: "pointer",
                          background: "#5865f2",
                          color: "#fff",
                        }}
                      >
                        Hoàn thành
                      </button>
                    </div>
                  )}

                {/* Input Area */}
                {isAdminView && selectedServer === adminViewServerId ? (
                  <div className={styles.inputArea} style={{ justifyContent: "center", opacity: 0.7 }}>
                    <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Chế độ xem Admin — chỉ đọc</span>
                  </div>
                ) : (
                <div
                  className={styles.inputArea}
                  style={{
                    opacity: shouldBlockServerChatInput ? 0.6 : 1,
                    pointerEvents: shouldBlockServerChatInput ? "none" : undefined,
                  }}
                >
                  {/* Plus Menu Button */}
                  <div style={{ position: "relative" }}>
                    <button
                      className={styles.plusButton}
                      title={t("chat.ageRestrict.moreOptions")}
                      onClick={() => setShowPlusMenu(!showPlusMenu)}
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M12 5v14M5 12h14"></path>
                      </svg>
                    </button>

                    {/* Plus Menu Popup */}
                    {showPlusMenu && (
                      <div className={styles.plusMenuPopup}>
                        <button
                          className={styles.plusMenuItem}
                          onClick={handleFileUpload}
                        >
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="17 8 12 3 7 8"></polyline>
                            <line x1="12" y1="3" x2="12" y2="15"></line>
                          </svg>
                          <span>{t("chat.composer.plusUploadFile")}</span>
                        </button>
                        <button
                          className={styles.plusMenuItem}
                          onClick={handleCreatePoll}
                        >
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                          </svg>
                          <span>{t("chat.composer.plusCreatePoll")}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {selectedServer &&
                    !selectedDirectMessageFriend &&
                    canUseMentions &&
                    !shouldBlockServerChatInput && (
                    <button
                      className={styles.plusButton}
                      title={t("chat.mention.tooltip")}
                      type="button"
                      onClick={() => {
                        const start = messageText.length;
                        setMessageText(messageText + "@");
                        setMentionOpen(true);
                        setMentionStartPos(start);
                        setMentionKeyword("");
                        fetchMentionSuggestions("");
                        requestAnimationFrame(() => {
                          const el = messageInputRef.current;
                          if (el) {
                            el.focus();
                            el.setSelectionRange(start + 1, start + 1);
                          }
                        });
                      }}
                      style={{ fontSize: "16px", fontWeight: 700 }}
                    >
                      @
                    </button>
                  )}

                  {/* Voice Recorder */}
                  {isRecordingVoice && (
                    <VoiceRecorder
                      onRecordComplete={handleVoiceRecordComplete}
                      onCancel={handleVoiceCancelRecording}
                    />
                  )}

                  {/* Uploading Indicator */}
                  {isUploadingVoice && (
                    <div className={styles.uploadingVoice}>
                      <div className={styles.spinner}></div>
                      <span>{t("chat.messagesPage.uploadingVoice")}</span>
                    </div>
                  )}

                  {/* Normal Text Input */}
                  {!isRecordingVoice && !isUploadingVoice && (
                    <>
                      <div className={styles.inputWrapper} style={{ position: "relative" }}>
                        {mentionOpen &&
                          selectedServer &&
                          !selectedDirectMessageFriend &&
                          canUseMentions &&
                          !shouldBlockServerChatInput && (
                          <MentionDropdown
                            suggestions={mentionSuggestions}
                            activeIndex={mentionActiveIndex}
                            keyword={mentionKeyword}
                            onSelect={handleMentionSelect}
                            onActiveIndexChange={setMentionActiveIndex}
                          />
                        )}
                        <input
                          ref={messageInputRef}
                          type="text"
                          className={styles.messageInput}
                          placeholder={t("chat.composer.messagePlaceholder")}
                          disabled={shouldBlockServerChatInput}
                          value={messageText}
                          onChange={(e) => {
                            const newValue = e.target.value;
                            setMessageText(newValue);

                            if (selectedServer && !selectedDirectMessageFriend && canUseMentions) {
                              const cursorPos = e.target.selectionStart ?? newValue.length;
                              handleMentionDetect(newValue, cursorPos);
                            }

                            if (
                              selectedDirectMessageFriend &&
                              notifyTyping &&
                              newValue.length > 0
                            ) {
                              if (!isTypingRef.current) {
                                isTypingRef.current = true;
                                notifyTyping(
                                  selectedDirectMessageFriend._id,
                                  true,
                                );
                              }

                              if (typingTimeoutRef.current) {
                                clearTimeout(typingTimeoutRef.current);
                              }

                              typingTimeoutRef.current = setTimeout(() => {
                                if (isTypingRef.current) {
                                  isTypingRef.current = false;
                                  notifyTyping(
                                    selectedDirectMessageFriend._id,
                                    false,
                                  );
                                }
                              }, 2000);
                            } else if (
                              selectedDirectMessageFriend &&
                              notifyTyping &&
                              newValue.length === 0 &&
                              isTypingRef.current
                            ) {
                              isTypingRef.current = false;
                              notifyTyping(
                                selectedDirectMessageFriend._id,
                                false,
                              );
                              if (typingTimeoutRef.current) {
                                clearTimeout(typingTimeoutRef.current);
                              }
                            }
                          }}
                          onKeyDown={(e) => {
                            if (
                              mentionOpen &&
                              mentionSuggestions.length > 0 &&
                              canUseMentions &&
                              !shouldBlockServerChatInput
                            ) {
                              if (["ArrowDown", "ArrowUp", "Tab", "Escape"].includes(e.key) || (e.key === "Enter" && !e.shiftKey)) {
                                handleMentionKeyDown(e);
                                return;
                              }
                            }

                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();

                              if (
                                selectedDirectMessageFriend &&
                                notifyTyping &&
                                isTypingRef.current
                              ) {
                                isTypingRef.current = false;
                                notifyTyping(
                                  selectedDirectMessageFriend._id,
                                  false,
                                );
                                if (typingTimeoutRef.current) {
                                  clearTimeout(typingTimeoutRef.current);
                                }
                              }

                              if (!selectedDirectMessageFriend && shouldBlockServerChatInput) {
                                void openVerificationRulesModal();
                                return;
                              }

                              selectedDirectMessageFriend
                                ? handleSendDirectMessage()
                                : handleSendMessage();
                            }
                          }}
                        />
                      </div>

                      {/* Media Buttons */}
                      <div className={styles.mediaButtons}>
                        {/* Voice Recording Button */}
                        <button
                          type="button"
                          className={styles.mediaButton}
                          title={t("chat.composer.voiceMessage")}
                          aria-label={t("chat.composer.voiceMessage")}
                          onClick={() => setIsRecordingVoice(true)}
                          disabled={isRecordingVoice || isUploadingVoice}
                        >
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                            <line x1="12" y1="19" x2="12" y2="23"></line>
                            <line x1="8" y1="23" x2="16" y2="23"></line>
                          </svg>
                        </button>

                        {/* GIF Button */}
                        <button
                          type="button"
                          className={styles.mediaButton}
                          title={t("chat.composer.sendGif")}
                          aria-label={t("chat.composer.sendGif")}
                          onClick={() => {
                            setMediaPickerTab("gif");
                            setShowGiphyPicker(true);
                          }}
                        >
                          <span
                            style={{ fontSize: "14px", fontWeight: "bold" }}
                          >
                            {t("chat.mediaPicker.tabGif")}
                          </span>
                        </button>

                        {/* Sticker Button */}
                        <button
                          type="button"
                          className={styles.mediaButton}
                          title={t("chat.composer.sendSticker")}
                          aria-label={t("chat.composer.sendSticker")}
                          onClick={() => {
                            setMediaPickerTab("sticker");
                            setShowGiphyPicker(true);
                          }}
                        >
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            {/* Paper/Note background */}
                            <rect
                              x="3"
                              y="2"
                              width="18"
                              height="20"
                              rx="2"
                              ry="2"
                            ></rect>
                            <line x1="7" y1="6" x2="17" y2="6"></line>
                            {/* Smiley face */}
                            <circle
                              cx="9"
                              cy="11"
                              r="1"
                              fill="currentColor"
                            ></circle>
                            <circle
                              cx="15"
                              cy="11"
                              r="1"
                              fill="currentColor"
                            ></circle>
                            <path
                              d="M9 14.5c0.5 1 1.5 1.5 3 1.5s2.5-0.5 3-1.5"
                              strokeLinecap="round"
                            ></path>
                          </svg>
                        </button>

                        {/* Emoji Picker */}
                        <button
                          type="button"
                          className={styles.mediaButton}
                          title={t("chat.composer.openEmojiPicker")}
                          aria-label={t("chat.composer.openEmojiPicker")}
                          onClick={() => {
                            setMediaPickerTab("emoji");
                            setShowGiphyPicker(true);
                          }}
                        >
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <circle cx="12" cy="12" r="10"></circle>
                            <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                            <line x1="9" y1="9" x2="9.01" y2="9"></line>
                            <line x1="15" y1="9" x2="15.01" y2="9"></line>
                          </svg>
                        </button>
                      </div>

                      <button
                        type="button"
                        className={styles.sendButton}
                        onClick={
                          selectedDirectMessageFriend
                            ? handleSendDirectMessage
                            : handleSendMessage
                        }
                        disabled={!messageText.trim() || (!selectedDirectMessageFriend && shouldBlockServerChatInput)}
                        title={t("chat.composer.sendMessage")}
                        aria-label={t("chat.composer.sendMessage")}
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M16.6915026,12.4744748 L3.50612381,13.2599618 C3.19218622,13.2599618 3.03521743,13.4170592 3.03521743,13.5741566 L1.15159189,20.0151496 C0.8376543,20.8006365 0.99,21.89 1.77946707,22.52 C2.41,22.99 3.50612381,23.1 4.13399899,22.8429026 L21.714504,14.0454487 C22.6563168,13.5741566 23.1272231,12.6315722 22.9702544,11.6889879 L4.13399899,1.16346272 C3.34915502,0.9 2.40734225,0.9 1.77946707,1.4071521 C0.994623095,2.0605983 0.837654326,3.0031827 1.15159189,3.7886696 L3.03521743,10.2296625 C3.03521743,10.3867599 3.19218622,10.5438573 3.50612381,10.5438573 L16.6915026,11.3293442 C16.6915026,11.3293442 17.1624089,11.3293442 17.1624089,10.8580521 L17.1624089,12.4744748 C17.1624089,12.4744748 17.1624089,12.9457669 16.6915026,12.4744748 Z"></path>
                        </svg>
                      </button>
                    </>
                  )}
                </div>
                )}
              </>
              )}
            </>
            ) : (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>💬</div>
                <p className={styles.emptyText}>
                  {loading
                    ? t("chat.chatPage.loadingSelectServer")
                    : t("chat.chatPage.selectServerPrompt")}
                </p>
              </div>
            )}
          </div>

          {/* Profile sidebar - only when chatting in DM; user can close/reopen */}
          {selectedDirectMessageFriend && (
            dmProfileSidebarOpen ? (
              <div className={styles.activeNowSidebar}>
                <div className={styles.activeNowHeader}>
                  <h3 className={styles.activeNowTitle}>{t("chat.profile.title")}</h3>
                  <button
                    type="button"
                    className={styles.activeNowCloseBtn}
                    onClick={() => setDmProfileSidebarOpen(false)}
                    title={t("chat.profile.close")}
                    aria-label={t("chat.profile.close")}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
                <div className={styles.activeNowContainer}>
                  <div className={styles.dmProfileCard}>
                    <div
                      className={styles.dmProfileAvatar}
                      style={{
                        backgroundImage: isValidAvatarUrl(
                          selectedDirectMessageFriend.avatarUrl,
                        )
                          ? `url(${selectedDirectMessageFriend.avatarUrl})`
                          : undefined,
                        backgroundColor: !isValidAvatarUrl(selectedDirectMessageFriend.avatarUrl)
                          ? "var(--color-primary)" : undefined,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    >
                      {!isValidAvatarUrl(selectedDirectMessageFriend.avatarUrl) && (
                        <span>
                          {(
                            selectedDirectMessageFriend.displayName ||
                            selectedDirectMessageFriend.username
                          )
                            ?.charAt(0)
                            ?.toUpperCase()}
                        </span>
                      )}
                    </div>

                    <p className={styles.dmProfileDisplayName}>
                      {selectedDirectMessageFriend.displayName ||
                        selectedDirectMessageFriend.username}
                    </p>
                    <p className={styles.dmProfileUsername}>
                      {selectedDirectMessageFriend.username}
                    </p>
                    {selectedDirectMessageFriend.email && (
                      <p className={styles.dmProfileEmail}>
                        {selectedDirectMessageFriend.email}
                      </p>
                    )}

                    {dmProfileDetail?.cordigramMemberSince ? (
                      <div className={styles.dmProfileMetaCard}>
                        <div className={styles.dmProfileMetaLabel}>
                          {t("chat.popups.userProfile.memberSinceLabel")}
                        </div>
                        <div className={styles.dmProfileMetaValue}>
                          {dmProfileDetail.cordigramMemberSince}
                        </div>
                      </div>
                    ) : null}

                    <div className={styles.dmProfileMetaCard}>
                      <div className={styles.dmProfileMetaLabel}>
                        {t("chat.popups.userProfile.mutualServersLabel")}
                      </div>
                      <div className={styles.dmProfileMetaValue}>
                        {dmProfileDetail?.mutualServerCount ?? 0}
                      </div>
                    </div>

                    {selectedDirectMessageFriend.bio && (
                      <div className={styles.dmProfileBio}>
                        {selectedDirectMessageFriend.bio}
                      </div>
                    )}

                    <button
                      type="button"
                      className={styles.dmProfileViewFull}
                      onClick={() =>
                        setDmProfilePopupUserId(selectedDirectMessageFriend._id)
                      }
                    >
                      {t("chat.profile.viewFull")}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className={styles.dmProfileSidebarToggle}
                onClick={() => setDmProfileSidebarOpen(true)}
                title={t("chat.profile.title")}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span>{t("chat.profile.title")}</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Popup quy định (tab Truy cập) — mở từ nút Hoàn thành khi chưa đủ xác minh */}
      {dmProfilePopupUserId && selectedDirectMessageFriend && (
        <UserProfilePopup
          userId={dmProfilePopupUserId}
          token={token}
          currentUserId={currentUserId}
          onClose={() => setDmProfilePopupUserId(null)}
          onMessage={() => setDmProfilePopupUserId(null)}
        />
      )}

      {(verificationRulesOpen || showAcceptRulesModal) && selectedServer && !selectedDirectMessageFriend && (() => {
        const srv = currentServer;
        const hasRulesContent = (verificationAccessSettings?.rules?.length ?? 0) > 0;
        const rulesAccepted = myServerAccessStatus?.acceptedRules !== false;
        const needsRulesStep = verificationAccessSettings?.hasRules && hasRulesContent && !rulesAccepted;
        const needsAgree = needsRulesStep;

        const lvl = myServerAccessStatus?.verificationLevel ?? "none";
        const chatBlocked = myServerAccessStatus?.chatViewBlocked === true;
        const blockReason = myServerAccessStatus?.chatBlockReason;
        const needsVerificationStep = (() => {
          if (lvl === "none") return false;
          if (chatBlocked && blockReason === "verification") return true;
          // Fail-safe: if status is stale/missing reason, still show verification when checks are not satisfied.
          const c = myServerAccessStatus?.verificationChecks;
          const w = myServerAccessStatus?.verificationWait;
          const emailOk = Boolean(c?.emailVerified);
          const accountOk = lvl === "low" ? true : Boolean(c?.accountOver5Min);
          const memberOk = lvl === "high" ? Boolean(c?.memberOver10Min) : true;
          const waitAccountOk = (w?.waitAccountSec ?? 0) <= 0;
          const waitMemberOk = (w?.waitMemberSec ?? 0) <= 0;
          return !(emailOk && accountOk && memberOk && waitAccountOk && waitMemberOk);
        })();

        const chk = myServerAccessStatus?.verificationChecks ?? {
          emailVerified: false,
          accountOver5Min: false,
          memberOver10Min: false,
        };
        const wait = {
          waitAccountSec: localWaitAccountSec,
          waitMemberSec: localWaitMemberSec,
        };
        const fmt = (sec: number | null | undefined) =>
          sec == null || sec <= 0
            ? null
            : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

        const submitDisabled = verificationRulesSubmitting || Boolean(needsAgree && !verificationRulesAgreed);

        return (
          <div
            role="dialog"
            aria-modal
            aria-label={t("chat.verify.dialogLabel")}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0, 0, 0, 0.7)",
              zIndex: 20001,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "flex",
                width: "min(780px, 96vw)",
                maxHeight: "min(680px, 90vh)",
                background: "#313338",
                borderRadius: 12,
                boxShadow: "0 16px 48px rgba(0,0,0,.55)",
                overflow: "hidden",
              }}
            >
              {/* Left: Server profile card */}
              <div
                style={{
                  width: 220,
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: "32px 16px 24px",
                  background: "#2b2d31",
                  borderRight: "1px solid #3f4147",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 16,
                    background: srv?.avatarUrl ? `url(${srv.avatarUrl}) center/cover no-repeat` : "#5865f2",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 32,
                    fontWeight: 800,
                    color: "#fff",
                    flexShrink: 0,
                  }}
                >
                  {!srv?.avatarUrl && (srv?.name?.charAt(0)?.toUpperCase() ?? "S")}
                </div>
                <p style={{ margin: 0, fontWeight: 800, fontSize: 16, color: "#f2f3f5", textAlign: "center" }}>
                  {srv?.name ?? t("chat.chatPage.serverFallback")}
                </p>
                <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#b5bac1", marginTop: 4 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3ba55d", display: "inline-block" }} />
                    {t("chat.chatPage.memberCount").replace("{count}", String(srv?.members?.filter(() => true).length ?? 0))}
                  </span>
                </div>
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "#949ba4" }}>
                  {t("chat.chatPage.foundedMonth").replace("{date}", srv?.createdAt ? new Date(srv.createdAt).toLocaleDateString(localeTagForLanguage(language), { month: "numeric", year: "numeric" }) : "")}
                </p>
              </div>

              {/* Right: Content */}
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  padding: "24px 28px",
                  overflow: "auto",
                  minWidth: 0,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#f2f3f5" }}>
                      {t("chat.verify.title")}
                    </h3>
                    <p style={{ margin: "6px 0 0", fontSize: 14, color: "#b5bac1", lineHeight: 1.45 }}>
                      {t("chat.verify.subtitle")}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={t("chat.profile.close")}
                    onClick={() => {
                      setVerificationRulesOpen(false);
                      setShowAcceptRulesModal(false);
                      setVerificationAccessSettings(null);
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#b5bac1",
                      fontSize: 22,
                      lineHeight: 1,
                      cursor: "pointer",
                      padding: 4,
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                </div>

                {/* Step 1: Rules (access tab) */}
                {hasRulesContent && (
                  <div style={{ marginTop: 20 }}>
                    <p style={{ margin: "0 0 10px", fontWeight: 800, fontSize: 12, textTransform: "uppercase", color: "#b5bac1", letterSpacing: "0.02em", display: "flex", alignItems: "center", gap: 8 }}>
                      {t("chat.verify.agreeRules")}
                      {rulesAccepted && <span style={{ color: "#3ba55d", fontSize: 14 }}>✓</span>}
                    </p>
                    <div
                      style={{
                        padding: 16,
                        borderRadius: 8,
                        background: "#1e1f22",
                        border: "1px solid #3f4147",
                        fontSize: 14,
                        lineHeight: 1.65,
                        color: "#dbdee1",
                      }}
                    >
                      <ol style={{ margin: 0, paddingLeft: 22 }}>
                        {verificationAccessSettings!.rules.map((r, i) => (
                          <li key={r.id} style={{ marginBottom: i < verificationAccessSettings!.rules.length - 1 ? 12 : 0, color: "#dbdee1" }}>
                            {r.content}
                          </li>
                        ))}
                      </ol>
                    </div>

                    {needsAgree && (
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          marginTop: 16,
                          fontSize: 14,
                          cursor: "pointer",
                          color: "#dbdee1",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={verificationRulesAgreed}
                          onChange={(e) => setVerificationRulesAgreed(e.target.checked)}
                          style={{ width: 18, height: 18, accentColor: "#5865f2", flexShrink: 0 }}
                        />
                        <span>{t("chat.verify.agreeCheckbox")}</span>
                      </label>
                    )}
                  </div>
                )}

                {/* Step 2: Verification (safety settings) - shown after rules accepted */}
                {needsVerificationStep && rulesAccepted && (
                  <div style={{ marginTop: 20 }}>
                    <p style={{ margin: "0 0 10px", fontWeight: 800, fontSize: 12, textTransform: "uppercase", color: "#b5bac1", letterSpacing: "0.02em" }}>
                      {t("chat.verify.verificationLevel").replace("{level}", lvl === "low" ? t("chat.verify.levelLow") : lvl === "medium" ? t("chat.verify.levelMedium") : lvl === "high" ? t("chat.verify.levelHigh") : "")}
                    </p>
                    <div
                      style={{
                        padding: 16,
                        borderRadius: 8,
                        background: "#1e1f22",
                        border: "1px solid #3f4147",
                        fontSize: 14,
                        lineHeight: 1.7,
                        color: "#dbdee1",
                      }}
                    >
                      <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
                        {(lvl === "low" || lvl === "medium" || lvl === "high") && (
                          <li style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8, color: chk.emailVerified ? "#3ba55d" : "#dbdee1" }}>
                            <span style={{ flexShrink: 0 }}>{chk.emailVerified ? "✓" : "○"}</span>
                            <div style={{ flex: 1 }}>
                              <span>{t("chat.verify.emailVerify")}</span>
                              {!chk.emailVerified && (
                                <div style={{ marginTop: 8 }}>
                                  {!emailOtpSent ? (
                                    <button
                                      onClick={async () => {
                                        if (!selectedServer) return;
                                        setEmailOtpSending(true);
                                        setEmailOtpError(null);
                                        try {
                                          const res = await serversApi.requestServerEmailOtp(selectedServer);
                                          if (res.ok) {
                                            setEmailOtpSent(true);
                                            setEmailOtpCooldown(60);
                                          } else if (res.retryAfterSec) {
                                            setEmailOtpCooldown(res.retryAfterSec);
                                            setEmailOtpError(t("chat.verify.waitRetry").replace("{sec}", String(res.retryAfterSec)));
                                          }
                                        } catch (e: any) {
                                          setEmailOtpError(e?.message || t("chat.verify.otpError"));
                                        } finally {
                                          setEmailOtpSending(false);
                                        }
                                      }}
                                      disabled={emailOtpSending || emailOtpCooldown > 0}
                                      style={{
                                        padding: "6px 16px",
                                        borderRadius: 4,
                                        border: "none",
                                        background: emailOtpSending || emailOtpCooldown > 0 ? "#4e5058" : "#5865f2",
                                        color: "#fff",
                                        fontWeight: 600,
                                        fontSize: 13,
                                        cursor: emailOtpSending || emailOtpCooldown > 0 ? "not-allowed" : "pointer",
                                      }}
                                    >
                                      {emailOtpSending ? t("chat.verify.sendOtpSending") : emailOtpCooldown > 0 ? t("chat.verify.sendOtpCooldown").replace("{sec}", String(emailOtpCooldown)) : t("chat.verify.sendOtpBtn")}
                                    </button>
                                  ) : (
                                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                      <input
                                        type="text"
                                        maxLength={6}
                                        placeholder={t("chat.verify.otpPlaceholder")}
                                        value={emailOtpCode}
                                        onChange={(e) => { setEmailOtpCode(e.target.value.replace(/\D/g, "")); setEmailOtpError(null); }}
                                        style={{
                                          padding: "6px 10px",
                                          borderRadius: 4,
                                          border: "1px solid #4e5058",
                                          background: "#1e1f22",
                                          color: "#fff",
                                          fontSize: 14,
                                          width: 100,
                                          letterSpacing: 4,
                                          textAlign: "center",
                                        }}
                                      />
                                      <button
                                        onClick={async () => {
                                          if (!selectedServer || !emailOtpCode.trim()) return;
                                          setEmailOtpVerifying(true);
                                          setEmailOtpError(null);
                                          try {
                                            await serversApi.verifyServerEmailOtp(selectedServer, emailOtpCode.trim());
                                            const status = await serversApi.getMyServerAccessStatus(selectedServer);
                                            setMyServerAccessStatus(status);
                                            setEmailOtpCode("");
                                            setEmailOtpSent(false);
                                          } catch (e: any) {
                                            setEmailOtpError(e?.message || t("chat.verify.otpInvalid"));
                                          } finally {
                                            setEmailOtpVerifying(false);
                                          }
                                        }}
                                        disabled={emailOtpVerifying || emailOtpCode.length < 4}
                                        style={{
                                          padding: "6px 16px",
                                          borderRadius: 4,
                                          border: "none",
                                          background: emailOtpVerifying || emailOtpCode.length < 4 ? "#4e5058" : "#3ba55d",
                                          color: "#fff",
                                          fontWeight: 600,
                                          fontSize: 13,
                                          cursor: emailOtpVerifying || emailOtpCode.length < 4 ? "not-allowed" : "pointer",
                                        }}
                                      >
                                        {emailOtpVerifying ? t("chat.verify.verifyOtpSending") : t("chat.verify.verifyOtpBtn")}
                                      </button>
                                      {emailOtpCooldown <= 0 && (
                                        <button
                                          onClick={async () => {
                                            if (!selectedServer) return;
                                            setEmailOtpSending(true);
                                            setEmailOtpError(null);
                                            try {
                                              const res = await serversApi.requestServerEmailOtp(selectedServer);
                                              if (res.ok) {
                                                setEmailOtpCooldown(60);
                                              } else if (res.retryAfterSec) {
                                                setEmailOtpCooldown(res.retryAfterSec);
                                              }
                                            } catch (e: any) {
                                              setEmailOtpError(e?.message || t("chat.verify.resendError"));
                                            } finally {
                                              setEmailOtpSending(false);
                                            }
                                          }}
                                          disabled={emailOtpSending}
                                          style={{
                                            padding: "6px 12px",
                                            borderRadius: 4,
                                            border: "none",
                                            background: "transparent",
                                            color: "#5865f2",
                                            fontWeight: 600,
                                            fontSize: 12,
                                            cursor: emailOtpSending ? "not-allowed" : "pointer",
                                          }}
                                        >
                                          {t("chat.verify.resendOtp")}
                                        </button>
                                      )}
                                      {emailOtpCooldown > 0 && (
                                        <span style={{ fontSize: 12, color: "#949ba4" }}>{t("chat.verify.resendAfter").replace("{sec}", String(emailOtpCooldown))}</span>
                                      )}
                                    </div>
                                  )}
                                  {emailOtpError && (
                                    <div style={{ color: "#ed4245", fontSize: 12, marginTop: 4 }}>{emailOtpError}</div>
                                  )}
                                </div>
                              )}
                            </div>
                          </li>
                        )}
                        {(lvl === "medium" || lvl === "high") && (
                          <li style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8, color: chk.accountOver5Min ? "#3ba55d" : "#dbdee1" }}>
                            <span style={{ flexShrink: 0 }}>{chk.accountOver5Min ? "✓" : "○"}</span>
                            <span>
                              {t("chat.verify.account5min")}
                              {!chk.accountOver5Min && wait.waitAccountSec != null && wait.waitAccountSec > 0 && (
                                <span style={{ color: "#949ba4", marginLeft: 6 }}>
                                  {t("chat.verify.waitApprox").replace("{time}", fmt(wait.waitAccountSec) ?? "")}
                                </span>
                              )}
                            </span>
                          </li>
                        )}
                        {lvl === "high" && (
                          <li style={{ display: "flex", gap: 8, alignItems: "flex-start", color: chk.memberOver10Min ? "#3ba55d" : "#dbdee1" }}>
                            <span style={{ flexShrink: 0 }}>{chk.memberOver10Min ? "✓" : "○"}</span>
                            <span>
                              {t("chat.verify.member10min")}
                              {!chk.memberOver10Min && wait.waitMemberSec != null && wait.waitMemberSec > 0 && (
                                <span style={{ color: "#949ba4", marginLeft: 6 }}>
                                  {t("chat.verify.waitApprox").replace("{time}", fmt(wait.waitMemberSec) ?? "")}
                                </span>
                              )}
                            </span>
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "auto", paddingTop: 20, gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => void submitVerificationRulesModal()}
                    disabled={submitDisabled}
                    style={{
                      border: "none",
                      background: submitDisabled ? "#3ba55d80" : "#3ba55d",
                      color: "white",
                      padding: "10px 20px",
                      borderRadius: 4,
                      cursor: submitDisabled ? "not-allowed" : "pointer",
                      fontWeight: 700,
                      fontSize: 14,
                    }}
                  >
                    {verificationRulesSubmitting ? t("chat.verify.submitting") : t("chat.verify.submitBtn")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Create Server Modal */}
      <CreateServerModal
        isOpen={showCreateServerModal}
        onClose={() => setShowCreateServerModal(false)}
        onServerCreated={handleServerCreated}
      />

      {showMessagesInbox && (
        <MessagesInbox
          onClose={() => {
            setShowMessagesInbox(false);
            fetchInboxForYou()
              .then((res) => {
                const hasUnread = (res.items ?? []).some((i) => i.seen !== true);
                setHasInboxNotification(hasUnread);
              })
              .catch(() => setHasInboxNotification(false));
          }}
          onMarkSeen={() => {
            fetchInboxForYou()
              .then((res) => {
                const hasUnread = (res.items ?? []).some((i) => i.seen !== true);
                setHasInboxNotification(hasUnread);
              })
              .catch(() => setHasInboxNotification(false));
          }}
          onNavigateToChannel={(serverId, channelId) => {
            setSelectedServer(serverId);
            trySelectChannel(channelId);
            setShowMessagesInbox(false);
          }}
          onNavigateToDM={(userId, displayName, username, avatarUrl) => {
            setShowMessagesInbox(false);
            const existing = friends.find((f) => f._id === userId);
            const friend: serversApi.Friend = existing ?? {
              _id: userId,
              displayName: displayName || username,
              username: username || "",
              avatarUrl: avatarUrl ?? "",
              email: "",
            };
            if (!existing) setFriends((prev) => (prev.some((f) => f._id === userId) ? prev : [...prev, friend]));
            setSelectedDirectMessageFriend(friend);
            setSelectedServer(null);
            setSelectedChannel(null);
            loadDirectMessages(userId);
          }}
          onAcceptInvite={async (serverId) => {
            await loadServers();
            setSelectedServer(serverId);
            setSelectedChannel(null);
          }}
          onApplyToJoinBeforeAccept={async (serverId, _inviteId) => {
            const opened = await openApplyJoinModalIfNeeded(serverId);
            return opened;
          }}
        />
      )}

      <MessageSearchPanel
        isOpen={showMessageSearch}
        onClose={() => {
          setShowMessageSearch(false);
          setMessageSearchDmConversationOnly(false);
        }}
        mode={selectedServer ? "server" : "dm"}
        dmConversationOnlySearch={messageSearchDmConversationOnly}
        serverId={selectedServer || undefined}
        serverName={currentServer?.name}
        channelId={selectedServer ? undefined : selectedChannel || undefined}
        channels={allChannels}
        members={selectedServer ? membersForMessageSearch : []}
        dmPeers={friends}
        serversForQuickSwitch={(selectedServer ? servers.filter((s) => s._id === selectedServer) : servers).map(
          (s) => ({
            _id: s._id,
            name: s.name || "",
            textChannels:
              s.textChannels?.length
                ? s.textChannels
                : (s.channels || []).filter(
                    (c) => c.type === "text" && c.category !== "info",
                  ),
            voiceChannels: s.voiceChannels?.length
              ? s.voiceChannels
              : (s.channels || []).filter((c) => c.type === "voice"),
          }),
        )}
        dmPartnerId={selectedDirectMessageFriend?._id}
        dmPartnerName={selectedDirectMessageFriend?.displayName || selectedDirectMessageFriend?.username}
        onResultClick={(messageId, channelId) => {
          setShowMessageSearch(false);
          setMessageSearchDmConversationOnly(false);
          if (channelId && selectedServer) {
            trySelectChannel(channelId);
          }
        }}
        onQuickSwitchDm={(userId) => {
          setShowMessageSearch(false);
          setMessageSearchDmConversationOnly(false);
          const friend = friends.find((f) => f._id === userId);
          if (friend) void handleSelectDirectMessageFriend(friend);
        }}
        onQuickSwitchChannel={async (sid, cid) => {
          setShowMessageSearch(false);
          setMessageSearchDmConversationOnly(false);
          setSelectedDirectMessageFriend(null);
          setSelectedServer(sid);
          await loadChannels(sid, { preferredChannelId: cid });
        }}
        onQuickSwitchServer={async (sid) => {
          setShowMessageSearch(false);
          setMessageSearchDmConversationOnly(false);
          setSelectedDirectMessageFriend(null);
          setSelectedServer(sid);
          await loadChannels(sid);
        }}
      />

      <CreateChannelModal
        isOpen={showCreateChannelModal}
        onClose={() => setShowCreateChannelModal(false)}
        defaultType={createChannelDefaultType}
        onCreateChannel={handleCreateChannel}
      />

      <CreateCategoryModal
        isOpen={showCreateCategoryModal}
        onClose={() => setShowCreateCategoryModal(false)}
        onCreateCategory={handleCreateCategory}
      />

      <EventsPopup
        isOpen={showEventsPopup}
        onClose={() => setShowEventsPopup(false)}
        serverId={selectedServer}
        onOpenCreateWizard={openCreateEventWizard}
      />

      {inviteToServerTarget && (
        <InviteToServerPopup
          isOpen
          onClose={() => setInviteToServerTarget(null)}
          serverId={inviteToServerTarget.serverId}
          serverName={inviteToServerTarget.serverName}
          friends={inviteToServerCandidates}
        />
      )}

      {adminServerContextMenu && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 9998 }}
            onClick={() => setAdminServerContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setAdminServerContextMenu(null); }}
          />
          <div
            style={{
              position: "fixed",
              left: adminServerContextMenu.x,
              top: adminServerContextMenu.y,
              zIndex: 9999,
              background: "var(--color-panel-bg)",
              borderRadius: 6,
              boxShadow: "0 4px 16px rgba(0,0,0,.4)",
              padding: "4px 0",
              minWidth: 180,
            }}
          >
            <button
              type="button"
              onClick={async () => {
                setAdminServerContextMenu(null);
                const t = localStorage.getItem("accessToken") || "";
                console.log("[AdminContextMenu] Leaving server:", adminViewServerId, "token exists:", !!t);
                if (adminViewServerId && t) {
                  await serversApi.adminLeaveServer(adminViewServerId, t);
                }
                localStorage.removeItem("accessToken");
                if (adminReturnUrl) window.location.href = adminReturnUrl;
              }}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", padding: "8px 12px", border: "none",
                background: "transparent", color: "var(--color-text)",
                fontSize: 14, cursor: "pointer", textAlign: "left",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--color-primary)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Rời khỏi
            </button>
          </div>
        </>
      )}

      {serverContextMenu && (
        <ServerContextMenu
          x={serverContextMenu.x}
          y={serverContextMenu.y}
          server={{
            _id: serverContextMenu.server._id,
            name: serverContextMenu.server.name,
            ownerId: String(
              (serverContextMenu.server as any).ownerId?._id ?? (serverContextMenu.server as any).ownerId ?? ""
            ),
          }}
          permissions={serverContextMenu.permissions ?? {
            isOwner: currentUserId !== "" &&
              String((serverContextMenu.server as any).ownerId?._id ?? (serverContextMenu.server as any).ownerId) === currentUserId,
            hasCustomRole: currentUserId !== "" &&
              String((serverContextMenu.server as any).ownerId?._id ?? (serverContextMenu.server as any).ownerId) === currentUserId,
            canKick: false,
            canBan: false,
            canTimeout: false,
            canManageServer: currentUserId !== "" &&
              String((serverContextMenu.server as any).ownerId?._id ?? (serverContextMenu.server as any).ownerId) === currentUserId,
            canManageChannels: currentUserId !== "" &&
              String((serverContextMenu.server as any).ownerId?._id ?? (serverContextMenu.server as any).ownerId) === currentUserId,
            canManageEvents: currentUserId !== "" &&
              String((serverContextMenu.server as any).ownerId?._id ?? (serverContextMenu.server as any).ownerId) === currentUserId,
            canManageExpressions: currentUserId !== "" &&
              String((serverContextMenu.server as any).ownerId?._id ?? (serverContextMenu.server as any).ownerId) === currentUserId,
            canCreateInvite: true,
          }}
          onClose={() => setServerContextMenu(null)}
          onMarkAsRead={() => setServerContextMenu(null)}
          onInviteToServer={() => {
            setInviteToServerTarget({
              serverId: serverContextMenu.server._id,
              serverName: serverContextMenu.server.name || "Máy chủ",
            });
            setServerContextMenu(null);
          }}
          onMuteServer={(duration) => {
            if (!currentUserId) return;
            const { mutedUntil, mutedForever } = sidebarPrefs.muteKeyToUntil(duration);
            sidebarPrefs.setServerMute(currentUserId, serverContextMenu.server._id, mutedUntil, mutedForever);
            bumpSidebarPrefs();
            setServerContextMenu(null);
          }}
          onUnmuteServer={() => {
            if (!currentUserId) return;
            sidebarPrefs.clearServerMute(currentUserId, serverContextMenu.server._id);
            bumpSidebarPrefs();
            setServerContextMenu(null);
          }}
          onSetNotificationLevel={(level) => {
            if (!currentUserId) return;
            sidebarPrefs.setServerNotify(currentUserId, serverContextMenu.server._id, level);
            if (serverContextMenu.server._id === selectedServer) {
              setServerNotificationLevel(level);
            }
            bumpSidebarPrefs();
            setServerContextMenu(null);
          }}
          hideMutedChannels={
            !!currentUserId &&
            !!serverContextMenu &&
            sidebarPrefs.getServerPrefs(currentUserId, serverContextMenu.server._id).hideMutedChannels === true
          }
          onToggleHideMutedChannels={() => {
            if (!currentUserId || !serverContextMenu) return;
            const sid = serverContextMenu.server._id;
            const cur = sidebarPrefs.getServerPrefs(currentUserId, sid).hideMutedChannels === true;
            sidebarPrefs.setServerHideMutedChannels(currentUserId, sid, !cur);
            bumpSidebarPrefs();
          }}
          showAllChannels={showAllChannels}
          onToggleShowAllChannels={() => setShowAllChannels((v) => !v)}
          onServerSettings={() => {
            setServerSettingsTarget({
              serverId: serverContextMenu.server._id,
              serverName: serverContextMenu.server.name || "Máy chủ",
            });
            setServerSettingsPermissions(serverContextMenu.permissions ?? null);
            serversApi.getCommunitySettings(serverContextMenu.server._id)
              .then((c) => setCommunityEnabled(c.enabled))
              .catch(() => setCommunityEnabled(false));
            setShowServerSettingsPanel(true);
            setServerContextMenu(null);
          }}
          onCreateChannel={() => {
            setSelectedServer(serverContextMenu.server._id);
            setCreateChannelDefaultType("text");
            setCreateChannelSectionLabel("");
            setCreateChannelCategoryId(undefined);
            setShowCreateChannelModal(true);
            setServerContextMenu(null);
          }}
          onCreateCategory={() => {
            setSelectedServer(serverContextMenu.server._id);
            setShowCreateCategoryModal(true);
            setServerContextMenu(null);
          }}
          onCreateEvent={() => {
            setSelectedServer(serverContextMenu.server._id);
            setShowEventsPopup(true);
            if (serverContextMenu.server._id) loadActiveEvents(serverContextMenu.server._id);
            setServerContextMenu(null);
          }}
          onLeaveServer={async () => {
            const serverId = serverContextMenu.server._id;
            try {
              await serversApi.leaveServer(serverId);
              setServers((prev) => prev.filter((s) => s._id !== serverId));
              if (selectedServer === serverId) {
                setSelectedServer(null);
                setSelectedChannel(null);
              }
              setServerContextMenu(null);
            } catch (err) {
              console.error(err);
              alert((err as Error)?.message ?? "Không thể rời máy chủ");
            }
          }}
          notificationLevel={
            currentUserId
              ? sidebarPrefs.getServerPrefs(currentUserId, serverContextMenu.server._id).serverNotify ?? "all"
              : "all"
          }
          suppressEveryoneHere={
            !!currentUserId &&
            !!sidebarPrefs.getServerPrefs(currentUserId, serverContextMenu.server._id).suppressEveryoneHere
          }
          suppressRoleMentions={
            !!currentUserId &&
            !!sidebarPrefs.getServerPrefs(currentUserId, serverContextMenu.server._id).suppressRoleMentions
          }
          onSetSuppressEveryoneHere={(v) => {
            if (!currentUserId) return;
            sidebarPrefs.setServerSuppressFlags(currentUserId, serverContextMenu.server._id, {
              suppressEveryoneHere: v,
            });
            bumpSidebarPrefs();
          }}
          onSetSuppressRoleMentions={(v) => {
            if (!currentUserId) return;
            sidebarPrefs.setServerSuppressFlags(currentUserId, serverContextMenu.server._id, {
              suppressRoleMentions: v,
            });
            bumpSidebarPrefs();
          }}
          serverMuted={
            !!(currentUserId
              ? sidebarPrefs.isServerMuted(
                  sidebarPrefs.getServerPrefs(currentUserId, serverContextMenu.server._id),
                )
              : false)
          }
        />
      )}

      {channelContextMenu && selectedServer && currentUserId && (() => {
        const sp = sidebarPrefs.getServerPrefs(currentUserId, selectedServer);
        const chId = channelContextMenu.channel._id;
        const catId = channelContextMenu.categoryId;
        const catPref = catId ? sp.categories[catId] : undefined;
        const chPref = sp.channels[chId];
        const categoryNotify: CategoryNotifyMode = catPref?.notify ?? "inherit_server";
        const channelNotify: ChannelNotifyMode = chPref?.notify ?? "inherit_category";
        const channelMuted = sidebarPrefs.isChannelMuted(chPref);
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        return (
          <ChannelContextMenu
            x={channelContextMenu.x}
            y={channelContextMenu.y}
            categoryId={catId}
            channel={channelContextMenu.channel}
            canManageChannelsStructure={canManageChannelsStructure}
            serverNotificationLevel={serverNotificationLevel}
            categoryNotifyMode={categoryNotify}
            channelNotifyMode={channelNotify}
            channelMuted={channelMuted}
            isMemberOfServer
            onClose={() => setChannelContextMenu(null)}
            onInviteToChannel={() => {
              trySelectChannel(channelContextMenu.channel._id);
            }}
            onCopyChannelLink={() => {
              const url = `${origin}/invite/server/${selectedServer}/${chId}`;
              void navigator.clipboard?.writeText(url).catch(() => {
                window.prompt("Sao chép liên kết:", url);
              });
            }}
            onMarkAsRead={() => serversApi.markChannelAsRead(chId)}
            onMuteChannel={(duration) => {
              const { mutedUntil, mutedForever } = sidebarPrefs.muteKeyToUntil(duration);
              sidebarPrefs.setChannelMute(currentUserId, selectedServer, chId, mutedUntil, mutedForever);
              bumpSidebarPrefs();
            }}
            onUnmuteChannel={() => {
              sidebarPrefs.clearChannelMute(currentUserId, selectedServer, chId);
              bumpSidebarPrefs();
            }}
            onSetChannelNotify={(mode) => {
              sidebarPrefs.setChannelNotify(currentUserId, selectedServer, chId, mode);
              bumpSidebarPrefs();
            }}
            onJoinServerThenOpenChannel={async () => {
              const opened = await openApplyJoinModalIfNeeded(selectedServer);
              if (opened) return;
              await serversApi.joinServer(selectedServer);
              await loadServers();
            }}
            onEditChannel={handleEditChannel}
            onDeleteChannel={handleDeleteChannel}
          />
        );
      })()}

      <ApplyToJoinQuestionsModal
        open={Boolean(applyJoinOpen && applyJoinForm && applyJoinServerId)}
        onClose={() => {
          if (applyJoinSubmitting) return;
          setApplyJoinOpen(false);
          setApplyJoinServerId(null);
          setApplyJoinForm(null);
          setError(null);
        }}
        server={{
          name: applyJoinServerMeta?.name ?? "Máy chủ",
          avatarUrl: applyJoinServerMeta?.avatarUrl,
          bannerUrl: applyJoinServerMeta?.bannerUrl,
          bannerImageUrl: applyJoinServerMeta?.bannerImageUrl,
          bannerColor: applyJoinServerMeta?.bannerColor,
          memberCount: applyJoinServerMeta?.memberCount,
          createdAt: applyJoinServerMeta?.createdAt,
        }}
        questions={applyJoinForm?.questions ?? []}
        submitting={applyJoinSubmitting}
        error={applyJoinOpen ? error : null}
        onSubmit={submitApplyJoin}
      />

      {categoryContextMenu && selectedServer && currentUserId && (() => {
        const sp = sidebarPrefs.getServerPrefs(currentUserId, selectedServer);
        const catId = categoryContextMenu.category._id;
        const catPref = sp.categories[catId];
        const categoryNotify: CategoryNotifyMode = catPref?.notify ?? "inherit_server";
        const categoryMuted = sidebarPrefs.isCategoryMuted(catPref);
        const collapseUiEnabled = Boolean(catPref?.collapseUiEnabled);
        const allCatIds = serverCategories.map((c) => c._id);
        return (
          <CategoryContextMenu
            x={categoryContextMenu.x}
            y={categoryContextMenu.y}
            category={categoryContextMenu.category}
            canManageChannelsStructure={canManageChannelsStructure}
            serverNotificationLevel={serverNotificationLevel}
            categoryNotifyMode={categoryNotify}
            collapseUiEnabled={collapseUiEnabled}
            categoryMuted={categoryMuted}
            onClose={() => setCategoryContextMenu(null)}
            onMarkAsRead={async () => {
              const list =
                catId === UNCATEGORIZED_CATEGORY_ID
                  ? getUncategorizedChannels()
                  : allChannels.filter((ch) => ch.categoryId === catId);
              for (const ch of list) {
                await serversApi.markChannelAsRead(ch._id).catch(() => {});
              }
            }}
            onToggleCollapseUi={(enabled) => {
              sidebarPrefs.setCategoryCollapseUi(currentUserId, selectedServer, catId, enabled);
              bumpSidebarPrefs();
            }}
            onCollapseAllCategories={() => {
              sidebarPrefs.collapseAllCategories(currentUserId, selectedServer, allCatIds);
              bumpSidebarPrefs();
            }}
            onMuteCategory={(duration) => {
              const { mutedUntil, mutedForever } = sidebarPrefs.muteKeyToUntil(duration);
              sidebarPrefs.setCategoryMute(currentUserId, selectedServer, catId, mutedUntil, mutedForever);
              bumpSidebarPrefs();
            }}
            onUnmuteCategory={() => {
              sidebarPrefs.clearCategoryMute(currentUserId, selectedServer, catId);
              bumpSidebarPrefs();
            }}
            onSetCategoryNotify={(mode) => {
              sidebarPrefs.setCategoryNotify(currentUserId, selectedServer, catId, mode);
              bumpSidebarPrefs();
            }}
            onEditCategory={() => {
              setRenamingCategoryId(categoryContextMenu.category._id);
              setRenamingCategoryName(categoryContextMenu.category.name);
            }}
            onDeleteCategory={() => {
              if (catId === UNCATEGORIZED_CATEGORY_ID) {
                if (
                  confirm(
                    'Bạn có chắc muốn xóa danh mục "Kênh khác"? Tất cả kênh bên trong (trừ kênh mặc định) sẽ bị xóa.',
                  )
                ) {
                  handleDeleteUncategorizedCategory();
                }
                return;
              }
              if (confirm(`Bạn có chắc muốn xóa danh mục "${categoryContextMenu.category.name}"? Các kênh bên trong sẽ không bị xóa.`)) {
                handleDeleteCategory(catId);
              }
            }}
          />
        );
      })()}

      <ServerSettingsPanel
        isOpen={showServerSettingsPanel}
        onClose={() => {
          setShowServerSettingsPanel(false);
          setServerSettingsTarget(null);
          setServerSettingsPermissions(null);
        }}
        serverName={serverSettingsTarget?.serverName ?? ""}
        serverId={serverSettingsTarget?.serverId ?? ""}
        initialSection={serverSettingsTarget?.initialSection}
        locale={
          ((serverSettingsTarget?.serverId
            ? (servers.find((s) => s._id === serverSettingsTarget.serverId) as any)?.primaryLanguage
            : undefined) as "vi" | "en" | undefined) || "vi"
        }
        isOwner={
          !!(
            serverSettingsTarget?.serverId &&
            currentUserId &&
            servers.find((s) => s._id === serverSettingsTarget.serverId)?.ownerId === currentUserId
          )
        }
        communityEnabled={communityEnabled}
        onCommunityActivated={() => {
          setCommunityEnabled(true);
          if (selectedServer) loadChannels(selectedServer);
        }}
        onDeleteServer={async (serverIdToDelete) => {
          await serversApi.deleteServer(serverIdToDelete);
          setShowServerSettingsPanel(false);
          setServerSettingsTarget(null);
          setSelectedServer(null);
          await loadServers();
        }}
        renderSection={(section) => {
          if (section === "profile" && serverSettingsTarget?.serverId) {
            const serverData =
              servers.find((s) => s._id === serverSettingsTarget.serverId) ?? null;
            return (
              <ServerProfileSection
                serverId={serverSettingsTarget.serverId}
                token={token}
                canManageSettings={
                  Boolean(serverSettingsPermissions?.isOwner) ||
                  Boolean(serverSettingsPermissions?.canManageServer)
                }
                initialServer={serverData}
                onUpdated={(updated) => {
                  setServers((prev) =>
                    prev.map((s) =>
                      s._id === updated._id
                        ? ({
                            ...s,
                            name: updated.name,
                            description: updated.description,
                            avatarUrl: updated.avatarUrl,
                            bannerUrl: (updated as any).bannerUrl,
                            profileTraits: (updated as any).profileTraits,
                          } as any)
                        : s,
                    ),
                  );
                  setServerSettingsTarget((prev) =>
                    prev && prev.serverId === updated._id
                      ? { ...prev, serverName: updated.name || prev.serverName }
                      : prev,
                  );
                }}
              />
            );
          }
          if (section === "members" && serverSettingsTarget?.serverId) {
            return (
              <ServerMembersSection
                serverId={serverSettingsTarget.serverId}
                isOwner={
                  !!(
                    currentUserId &&
                    servers.find((s) => s._id === serverSettingsTarget?.serverId)?.ownerId === currentUserId
                  )
                }
                currentUserId={currentUserId ?? ""}
                token={token}
                onNavigateToDM={(userId, displayName, username, avatarUrl) => {
                  setShowServerSettingsPanel(false);
                  setServerSettingsTarget(null);
                  const existing = friends.find((f) => f._id === userId);
                  const friend: serversApi.Friend = existing ?? {
                    _id: userId,
                    displayName: displayName || username,
                    username: username || "",
                    avatarUrl: avatarUrl ?? "",
                    email: "",
                  };
                  if (!existing) setFriends((prev) => (prev.some((f) => f._id === userId) ? prev : [...prev, friend]));
                  setSelectedDirectMessageFriend(friend);
                  setSelectedServer(null);
                  setSelectedChannel(null);
                  loadDirectMessages(userId);
                }}
                onOwnershipTransferred={async () => {
                  setShowServerSettingsPanel(false);
                  setServerSettingsTarget(null);
                  await loadServers();
                }}
              />
            );
          }
          if (section === "roles" && serverSettingsTarget?.serverId) {
            return (
              <RolesSection
                serverId={serverSettingsTarget.serverId}
                isOwner={
                  Boolean(serverSettingsPermissions?.isOwner) ||
                  Boolean(serverSettingsPermissions?.canManageServer)
                }
              />
            );
          }
          if (section === "interactions" && serverSettingsTarget?.serverId) {
            return (
              <ServerInteractionsSection
                serverId={serverSettingsTarget.serverId}
                canManageSettings={
                  Boolean(serverSettingsPermissions?.isOwner) ||
                  Boolean(serverSettingsPermissions?.canManageServer)
                }
                textChannels={allChannels.filter((c) => c.type !== "voice")}
              />
            );
          }
          if (section === "access" && serverSettingsTarget?.serverId) {
            return (
              <ServerAccessSection
                serverId={serverSettingsTarget.serverId}
                canManageSettings={
                  Boolean(serverSettingsPermissions?.isOwner) ||
                  Boolean(serverSettingsPermissions?.canManageServer)
                }
              />
            );
          }
          if (section === "bans" && serverSettingsTarget?.serverId) {
            return (
              <ServerBansSection
                serverId={serverSettingsTarget.serverId}
                canManageBans={
                  Boolean(serverSettingsPermissions?.isOwner) ||
                  Boolean(serverSettingsPermissions?.canBan)
                }
              />
            );
          }
          if (section === "automod" && serverSettingsTarget?.serverId) {
            return (
              <AutoModSection
                serverId={serverSettingsTarget.serverId}
                canManageSettings={
                  Boolean(serverSettingsPermissions?.isOwner) ||
                  Boolean(serverSettingsPermissions?.canManageServer)
                }
              />
            );
          }
          if (section === "safety" && serverSettingsTarget?.serverId) {
            const initialTab = mapSectionToSafetyTab(section);
            return (
              <ServerSafetySection
                serverId={serverSettingsTarget.serverId}
                canManageSettings={
                  Boolean(serverSettingsPermissions?.isOwner) ||
                  Boolean(serverSettingsPermissions?.canManageServer)
                }
                initialTab={initialTab}
              />
            );
          }
          if (section === "community" && serverSettingsTarget?.serverId) {
            return (
              <CommunitySection
                serverId={serverSettingsTarget.serverId}
                canManageSettings={
                  Boolean(serverSettingsPermissions?.isOwner) ||
                  Boolean(serverSettingsPermissions?.canManageServer)
                }
                onCommunityActivated={() => {
                  setCommunityEnabled(true);
                  if (selectedServer) loadChannels(selectedServer);
                }}
              />
            );
          }
          if (section === "community-overview" && serverSettingsTarget?.serverId) {
            const serverData =
              servers.find((s) => s._id === serverSettingsTarget.serverId) ?? null;
            return (
              <CommunityOverviewSection
                serverId={serverSettingsTarget.serverId}
                canManageSettings={
                  Boolean(serverSettingsPermissions?.isOwner) ||
                  Boolean(serverSettingsPermissions?.canManageServer)
                }
                initialServer={serverData as any}
                onUpdated={(patch) => {
                  setServers((prev) =>
                    prev.map((s) =>
                      s._id === serverSettingsTarget.serverId
                        ? ({ ...s, ...patch } as any)
                        : s,
                    ),
                  );
                }}
              />
            );
          }
          if (section === "community-onboarding" && serverSettingsTarget?.serverId) {
            return (
              <div style={{ padding: 24, color: "var(--color-panel-text)" }}>
                <h2 style={{ color: "var(--color-panel-text)", marginBottom: 8 }}>
                  {t("chat.chatPage.communityOnboardingTitle")}
                </h2>
                <p style={{ margin: 0, color: "var(--color-panel-text-muted)", lineHeight: 1.5 }}>
                  {t("chat.chatPage.communityOnboardingDesc")}
                </p>
              </div>
            );
          }
          if (section === "emoji" && serverSettingsTarget?.serverId && token) {
            const canManageEmoji =
              Boolean(serverSettingsPermissions?.isOwner) ||
              Boolean(serverSettingsPermissions?.canManageServer) ||
              Boolean(serverSettingsPermissions?.canManageExpressions);
            return (
              <ServerEmojiSection
                serverId={serverSettingsTarget.serverId}
                token={token}
                canManage={canManageEmoji}
                onEmojisChanged={() => {
                  if (serverSettingsTarget.serverId === selectedServer) {
                    void refreshServerEmojiMap();
                  }
                }}
              />
            );
          }
          if (section === "sticker" && serverSettingsTarget?.serverId && token) {
            const canManageSticker =
              Boolean(serverSettingsPermissions?.isOwner) ||
              Boolean(serverSettingsPermissions?.canManageServer) ||
              Boolean(serverSettingsPermissions?.canManageExpressions);
            return (
              <ServerStickerSection
                serverId={serverSettingsTarget.serverId}
                token={token}
                canManage={canManageSticker}
                isServerOwner={Boolean(serverSettingsPermissions?.isOwner)}
                onOpenBoostSubscribe={() => {
                  setShowServerSettingsPanel(false);
                  setServerSettingsTarget(null);
                  setServerSettingsPermissions(null);
                  setShowExploreView(false);
                  setShowJoinApplicationsView(false);
                  setSelectedDirectMessageFriend(null);
                  setShowBoostUpgradeView(true);
                  setBoostModalOpen(false);
                  setBoostModalStep("plan");
                  setBoostMode("subscribe");
                }}
              />
            );
          }
          return undefined;
        }}
      />

      {selectedServer && (
        <CreateEventWizard
          isOpen={showCreateEventWizard}
          onClose={() => setShowCreateEventWizard(false)}
          serverId={selectedServer}
          textChannels={textChannels}
          voiceChannels={voiceChannels}
          onCreateSuccess={handleEventCreated}
          onOpenImageEditor={handleOpenEventImageEditor}
        />
      )}

      <EventImageEditor
        isOpen={showEventImageEditor}
        onClose={handleEventImageEditorClose}
        currentImageUrl={eventImageEditorCurrentUrl}
        onConfirm={handleEventImageEditorConfirm}
      />

      <ShareEventPopup
        isOpen={showShareEventPopup}
        onClose={() => {
          setShowShareEventPopup(false);
          if (selectedServer) loadActiveEvents(selectedServer);
        }}
        shareLink={shareEventLink}
      />

      {createdEventDetail && (
        <EventCreatedDetailPopup
          isOpen
          onClose={() => {
            setCreatedEventDetail(null);
            if (selectedServer) loadActiveEvents(selectedServer);
          }}
          event={createdEventDetail}
          serverName={currentServer?.name ?? ""}
          serverId={selectedServer ?? undefined}
          shareLink={shareEventLink}
          onStart={async () => {
            if (!selectedServer) return;
            await serversApi.startServerEvent(selectedServer, createdEventDetail._id);
            setCreatedEventDetail(null);
            loadActiveEvents(selectedServer);
          }}
        />
      )}

      {/* Modal Chi Tiết Sự Kiện */}
      {selectedEventDetail && (() => {
        const isLive = selectedEventDetail.status === "live";
        const isScheduled = selectedEventDetail.status === "scheduled" || !selectedEventDetail.status;
        const isOwnerOrMod = currentServer?.members?.some(
          (m: { userId: string; role: string }) =>
            m.userId === currentUserId && (m.role === "owner" || m.role === "moderator")
        );
        const minsUntilStart = (new Date(selectedEventDetail.startAt).getTime() - Date.now()) / 60000;
        const countdownStr =
          minsUntilStart < 0
            ? "Đã bắt đầu"
            : minsUntilStart < 1
              ? "Bắt đầu trong vài giây"
              : minsUntilStart < 60
                ? `Bắt đầu sau ${Math.floor(minsUntilStart)} phút nữa`
                : `Bắt đầu sau ${Math.floor(minsUntilStart / 60)} giờ ${Math.floor(minsUntilStart % 60)} phút nữa`;
        const startDateStr = new Date(selectedEventDetail.startAt).toLocaleDateString("vi-VN", {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
        const endTimeStr = new Date(selectedEventDetail.endAt).toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        });
        return (
          <div
            className={styles.eventDetailOverlay}
            onClick={() => {
              setSelectedEventDetail(null);
              if (selectedServer) loadActiveEvents(selectedServer);
            }}
            role="dialog"
            aria-modal
          >
            <div
              className={styles.eventDetailModal}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className={styles.eventDetailClose}
                onClick={() => {
                  setSelectedEventDetail(null);
                  if (selectedServer) loadActiveEvents(selectedServer);
                }}
                aria-label={t("chat.profile.close")}
              >
                ×
              </button>
              <div className={styles.eventDetailHeader}>
                <span className={styles.eventDetailIcon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </span>
                <h2 className={styles.eventDetailHeaderTitle}>1 Sự kiện</h2>
                <button
                  type="button"
                  className={styles.eventDetailCreateBtn}
                  onClick={() => {
                    setSelectedEventDetail(null);
                    setShowEventsPopup(true);
                    if (selectedServer) loadActiveEvents(selectedServer);
                  }}
                >
                  Tạo Sự kiện
                </button>
              </div>
              {selectedEventDetail.coverImageUrl && (
                <img
                  src={selectedEventDetail.coverImageUrl}
                  alt=""
                  className={styles.eventDetailBanner}
                />
              )}
              {isScheduled && (
                <>
                  <div className={styles.eventDetailCountdown}>{countdownStr}</div>
                  <div className={styles.eventDetailStartDate}>{startDateStr}</div>
                </>
              )}
              {isLive && (
                <div className={styles.eventDetailMeta}>
                  <span className={styles.eventDetailLive}>
                    <span className={styles.activeEventDot} />
                    {t("chat.sidebar.eventDetailLive", { time: endTimeStr })}
                  </span>
                </div>
              )}
              <h3 className={styles.eventDetailTitle}>{selectedEventDetail.topic}</h3>
              <div className={styles.eventDetailRow}>
                <span className={styles.eventDetailIcon}>📍</span>
                <span>
                  {t("chat.sidebar.eventDetailHostedBy", { name: currentServer?.name ?? "" })}
                  {selectedEventDetail.channelId
                    ? ` > # ${selectedEventDetail.channelId.name}`
                    : ""}
                </span>
              </div>
              {selectedEventDetail.description && (
                <p className={styles.eventDetailDesc}>{selectedEventDetail.description}</p>
              )}
              <div className={styles.eventDetailActions}>
                <button
                  type="button"
                  className={styles.eventDetailCopyBtn}
                  onClick={async () => {
                    const link =
                      currentServer?._id && selectedEventDetail._id
                        ? serversApi.getEventShareLink(currentServer._id, selectedEventDetail._id)
                        : "";
                    try {
                      if (link) await navigator.clipboard.writeText(link);
                    } catch (e) {
                      console.error(e);
                    }
                  }}
                >
                  {t("chat.sidebar.eventDetailCopyLink")}
                </button>
                <button
                  type="button"
                  className={`${styles.eventDetailJoinBtn} ${eventDetailInterested ? styles.eventDetailInterestedActive : ""}`}
                  onClick={() => setEventDetailInterested((v) => !v)}
                >
                  {t("chat.sidebar.eventDetailInterested")}
                </button>
                {isScheduled && isOwnerOrMod && (
                  <button
                    type="button"
                    className={styles.eventDetailStartBtn}
                    onClick={async () => {
                      if (!selectedServer) return;
                      try {
                        const updated = await serversApi.startServerEvent(selectedServer, selectedEventDetail._id);
                        setSelectedEventDetail({ ...selectedEventDetail, status: updated.status });
                        loadActiveEvents(selectedServer);
                      } catch (e) {
                        console.error(e);
                      }
                    }}
                  >
                    {t("chat.sidebar.eventDetailStart")}
                  </button>
                )}
                {isLive && isOwnerOrMod && (
                  <button
                    type="button"
                    className={styles.eventDetailEndBtn}
                    onClick={async () => {
                      if (!selectedServer) return;
                      try {
                        await serversApi.endServerEvent(selectedServer, selectedEventDetail._id);
                        setSelectedEventDetail(null);
                        if (selectedServer) loadActiveEvents(selectedServer);
                      } catch (e) {
                        console.error(e);
                      }
                    }}
                  >
                    {t("chat.sidebar.eventDetailEnd")}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Create Poll Modal */}
      {showCreatePollModal && (
        <div className={styles.modalOverlay} onClick={handleCancelPoll}>
          <div
            className={styles.createPollModal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.pollModalHeader}>
              <h2>Tạo khảo sát</h2>
              <button className={styles.closeButton} onClick={handleCancelPoll}>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div className={styles.pollModalBody}>
              {/* Question */}
              <div className={styles.pollField}>
                <label className={styles.pollLabel}>Câu hỏi</label>
                <div className={styles.pollInputWrapper}>
                  <input
                    type="text"
                    className={styles.pollInput}
                    placeholder="Bạn muốn hỏi gì?"
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    maxLength={300}
                  />
                  <span className={styles.charCounter}>
                    {pollQuestion.length} / 300
                  </span>
                </div>
              </div>

              {/* Options */}
              <div className={styles.pollField}>
                <label className={styles.pollLabel}>Các phương án trả lời</label>
                {pollOptions.map((option, index) => (
                  <div key={index} className={styles.pollOptionRow}>
                    <button className={styles.emojiButton}>
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                        <line x1="9" y1="9" x2="9.01" y2="9"></line>
                        <line x1="15" y1="9" x2="15.01" y2="9"></line>
                      </svg>
                    </button>
                    <input
                      type="text"
                      className={styles.pollOptionInput}
                      placeholder="Nhập câu trả lời"
                      value={option}
                      onChange={(e) =>
                        handlePollOptionChange(index, e.target.value)
                      }
                    />
                    {pollOptions.length > 2 && (
                      <button
                        className={styles.deleteOptionButton}
                        onClick={() => handleRemovePollOption(index)}
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
                <button
                  className={styles.addOptionButton}
                  onClick={handleAddPollOption}
                >
                  + Thêm phương án
                </button>
              </div>

              {/* Duration */}
              <div className={styles.pollField}>
                <label className={styles.pollLabel}>Thời gian</label>
                <select
                  className={styles.pollSelect}
                  value={pollDuration}
                  onChange={(e) => setPollDuration(Number(e.target.value))}
                >
                  <option value={1}>1 giờ</option>
                  <option value={4}>4 giờ</option>
                  <option value={8}>8 giờ</option>
                  <option value={24}>24 giờ</option>
                  <option value={72}>3 ngày</option>
                  <option value={168}>7 ngày</option>
                </select>
              </div>

              {/* Allow Multiple */}
              <div className={styles.pollCheckboxRow}>
                <input
                  type="checkbox"
                  id="allowMultiple"
                  checked={pollAllowMultiple}
                  onChange={(e) => setPollAllowMultiple(e.target.checked)}
                />
                <label htmlFor="allowMultiple">Cho phép chọn nhiều phương án</label>
              </div>
            </div>

            <div className={styles.pollModalFooter}>
              <button
                className={styles.cancelButton}
                onClick={handleCancelPoll}
              >
                Hủy
              </button>
              <button
                className={styles.submitButton}
                onClick={handleSubmitPoll}
              >
                Đăng
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            position: "fixed",
            bottom: "20px",
            left: "20px",
            background: "#ff6b6b",
            color: "white",
            padding: "12px 16px",
            borderRadius: "4px",
            zIndex: 1001,
          }}
        >
          {error}
        </div>
      )}

      {/* Incoming Call Popup */}
      {incomingCall && (
        <IncomingCallPopup
          callerName={
            incomingCall.callerInfo.displayName ||
            incomingCall.callerInfo.username
          }
          callerAvatar={
            isValidAvatarUrl(incomingCall.callerInfo.avatar)
              ? incomingCall.callerInfo.avatar
              : undefined
          }
          callType={incomingCall.type}
          onAccept={handleAcceptCall}
          onReject={handleRejectCall}
          status={incomingCall.status}
        />
      )}

      {/* Outgoing Call Popup */}
      {outgoingCall && (
        <OutgoingCallPopup
          receiverName={
            outgoingCall.toUser.displayName || outgoingCall.toUser.username
          }
          receiverAvatar={
            isValidAvatarUrl(outgoingCall.toUser.avatarUrl)
              ? outgoingCall.toUser.avatarUrl
              : undefined
          }
          callType={outgoingCall.type}
          onCancel={handleCancelCall}
          status={outgoingCall.status}
        />
      )}

      {channelProfileContext && token ? (
        <ChannelUserProfileRoot
          open
          context={channelProfileContext}
          token={token}
          inviteableServers={channelProfileInviteServers}
          onClose={() => setChannelProfileContext(null)}
          onOpenDirectMessage={handleOpenDmFromChannelProfile}
          onToast={(m) => setToastMessage(m)}
        />
      ) : null}

      {showMessagesUserSettings && token && !isAdminView ? (
        <MessagesUserSettingsModal
          open
          onClose={() => setShowMessagesUserSettings(false)}
          token={token}
          currentUserId={currentUserId}
          servers={servers.map((s) => ({ _id: s._id, name: s.name }))}
          onToast={(m) => {
            setToastMessage(m);
            setTimeout(() => setToastMessage(null), 3000);
          }}
        />
      ) : null}

      {/* Giphy Picker Modal */}
      {showGiphyPicker && (
        <GiphyPicker
          onSelect={handleGiphyPickerSelect}
          onClose={() => setShowGiphyPicker(false)}
          initialTab={mediaPickerTab}
          contextServerId={selectedServer ?? null}
          ownedServers={ownedServersForPicker}
          onManageServerStickers={(sid) =>
            void openServerSettingsFromMediaPicker(sid, "sticker")
          }
          onManageServerEmojis={(sid) =>
            void openServerSettingsFromMediaPicker(sid, "emoji")
          }
          enableServerMedia={
            !!(selectedChannel || selectedDirectMessageFriend)
          }
          adminMediaPicker={Boolean(
            isAdminView &&
              adminViewServerId &&
              selectedServer &&
              String(selectedServer) === String(adminViewServerId),
          )}
        />
      )}

      {/* Report Message Dialog */}
      {showReportDialog && (
        <ReportMessageDialog
          onSubmit={(reason, description) =>
            handleReportMessage(showReportDialog, reason, description)
          }
          onClose={() => setShowReportDialog(null)}
        />
      )}

      {/* Delete Message Dialog */}
      {showDeleteDialog && (
        <DeleteMessageDialog
          onConfirm={(deleteType) =>
            handleDeleteMessage(showDeleteDialog, deleteType)
          }
          onClose={() => setShowDeleteDialog(null)}
        />
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#2b2d31",
            color: "#dbdee1",
            padding: "12px 24px",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
            zIndex: 3000,
            animation: "slideUpFade 0.3s ease",
            fontSize: "14px",
            fontWeight: 500,
          }}
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}

function ExploreServersView({
  onClose,
  onJoin,
}: {
  onClose: () => void;
  onJoin: (serverId: string) => void | Promise<void>;
}) {
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [servers, setServers] = useState<ExploreServer[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    serversApi
      .listExploreServers()
      .then((data) => {
        if (cancelled) return;
        setServers(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : t("chat.explore.loadError"));
        setServers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={styles.explorePage}>
      <div className={styles.exploreHero}>
        <div className={styles.exploreHeroTop}>
          <button type="button" className={styles.exploreBackBtn} onClick={onClose}>
            {t("chat.explore.backToChat")}
          </button>
        </div>
        <h2 className={styles.exploreHeroTitle}>{t("chat.explore.title")}</h2>
        <p className={styles.exploreHeroSub}>{t("chat.explore.subtitle")}</p>
      </div>

      {loading ? (
        <div style={{ padding: 28, color: "var(--color-text-muted)" }}>{t("chat.explore.loading")}</div>
      ) : error ? (
        <div style={{ padding: 28, color: "var(--color-danger)" }}>{error}</div>
      ) : servers.length === 0 ? (
        <div style={{ padding: 28, color: "var(--color-text-muted)" }}>{t("chat.explore.empty")}</div>
      ) : (
        <div className={styles.exploreGrid}>
          {servers.map((s) => {
            const b = normalizeServerBanner(s);
            return (
            <div key={s.id} className={styles.exploreCard}>
              <div
                className={styles.exploreCardBanner}
                style={{ background: b.bannerColor }}
              >
                {b.bannerImageUrl ? (
                  <div
                    className={styles.exploreCardBannerImage}
                    style={{ backgroundImage: `url(${b.bannerImageUrl})` }}
                  />
                ) : null}
              </div>
              <div className={styles.exploreCardBody}>
                <div className={styles.exploreCardHeader}>
                  <div
                    className={styles.exploreCardAvatar}
                    style={{
                      backgroundImage: s.avatarUrl ? `url(${s.avatarUrl})` : undefined,
                    }}
                    aria-hidden
                  />
                  <div style={{ minWidth: 0 }}>
                    <div className={styles.exploreCardName}>{s.name}</div>
                    <div className={styles.exploreCardMeta}>
                      {t("chat.explore.members", { count: String(Number(s.memberCount || 0).toLocaleString(language === "vi" ? "vi-VN" : language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-US")) })}
                      {s.accessMode === "apply" ? " • " + t("chat.explore.badgeApply") : s.accessMode === "invite_only" ? " • " + t("chat.explore.badgeInviteOnly") : ""}
                    </div>
                  </div>
                </div>

                <div className={styles.exploreCardDesc}>{s.description || " "}</div>

                <button
                  type="button"
                  className={styles.exploreJoinBtn}
                  onClick={() => onJoin(s.id)}
                  disabled={s.accessMode === "invite_only"}
                  title={s.accessMode === "invite_only" ? t("chat.explore.inviteOnlyTitle") : t("chat.explore.join")}
                  style={s.accessMode === "invite_only" ? { opacity: 0.6, cursor: "not-allowed" } : undefined}
                >
                  {s.accessMode === "invite_only" ? t("chat.explore.inviteOnly") : t("chat.explore.join")}
                </button>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CommunityOverviewSection({
  serverId,
  canManageSettings,
  initialServer,
  onUpdated,
}: {
  serverId: string;
  canManageSettings: boolean;
  initialServer: (serversApi.Server & { primaryLanguage?: "vi" | "en" }) | null;
  onUpdated?: (patch: Partial<serversApi.Server>) => void;
}) {
  const { t, language } = useLanguage();
  const [channels, setChannels] = useState<serversApi.Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rulesChannelId, setRulesChannelId] = useState<string | null>(null);
  const [primaryLanguage, setPrimaryLanguage] = useState<"vi" | "en">(
    (initialServer as any)?.primaryLanguage || "vi",
  );
  const [description, setDescription] = useState<string>(
    (initialServer as any)?.description || "",
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([serversApi.getChannels(serverId), serversApi.getCommunitySettings(serverId)])
      .then(([chs, community]) => {
        if (cancelled) return;
        setChannels(chs);
        setRulesChannelId(community.rulesChannelId ?? null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Không tải được");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  const textChannels = channels.filter((c) => c.type !== "voice");

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "var(--color-text)" }}>
          {t("chat.communityOverview.title")}
        </h2>
        <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)", fontSize: 13, lineHeight: 1.5 }}>
          {t("chat.communityOverview.subtitle")}
        </p>
      </div>

      {loading ? (
        <div style={{ color: "var(--color-text-muted)" }}>{t("chat.communityOverview.loading")}</div>
      ) : (
        <>
          {error && (
            <div style={{ marginBottom: 10, color: "var(--color-danger)" }}>{error}</div>
          )}

          <div style={{ display: "grid", gap: 18, maxWidth: 760 }}>
            <div>
              <div style={{ fontWeight: 800, color: "var(--color-text)", marginBottom: 6 }}>
                {t("chat.communityOverview.rulesChannelLabel")}
              </div>
              <div style={{ color: "var(--color-text-muted)", fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>
                {t("chat.communityOverview.rulesChannelHint")}
              </div>
              <select
                value={rulesChannelId ?? ""}
                onChange={(e) => setRulesChannelId(e.target.value || null)}
                disabled={!canManageSettings}
                style={{
                  width: "100%",
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                }}
              >
                <option value="">{t("chat.communityOverview.noChannel")}</option>
                {textChannels.map((ch) => (
                  <option key={ch._id} value={ch._id}>
                    #{translateChannelName(ch.name, language)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ fontWeight: 800, color: "var(--color-text)", marginBottom: 6 }}>
                {t("chat.communityOverview.langLabel")}
              </div>
              <div style={{ color: "var(--color-text-muted)", fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>
                {t("chat.communityOverview.langHint")}
              </div>
              <select
                value={primaryLanguage}
                onChange={(e) => setPrimaryLanguage(e.target.value as any)}
                disabled={!canManageSettings}
                style={{
                  width: "100%",
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                }}
              >
                <option value="vi">{t("chat.communityOverview.langVi")}</option>
                <option value="en">{t("chat.communityOverview.langEn")}</option>
              </select>
            </div>

            <div>
              <div style={{ fontWeight: 800, color: "var(--color-text)", marginBottom: 6 }}>
                {t("chat.communityOverview.descLabel")}
              </div>
              <div style={{ color: "var(--color-text-muted)", fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>
                {t("chat.communityOverview.descHint")}
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!canManageSettings}
                rows={4}
                placeholder={t("chat.communityOverview.descPlaceholder")}
                style={{
                  width: "100%",
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                  resize: "vertical",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                disabled={!canManageSettings || saving}
                onClick={async () => {
                  setSaving(true);
                  setError(null);
                  try {
                    const res = await serversApi.updateCommunityOverview(serverId, {
                      rulesChannelId,
                      primaryLanguage,
                      description,
                    });
                    onUpdated?.({
                      description: res.description ?? undefined,
                      primaryLanguage: res.primaryLanguage,
                    } as any);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : t("chat.communityOverview.errorSave"));
                  } finally {
                    setSaving(false);
                  }
                }}
                style={{
                  border: "none",
                  borderRadius: 10,
                  padding: "10px 12px",
                  background: "var(--color-primary)",
                  color: "#fff",
                  fontWeight: 900,
                  cursor: !canManageSettings || saving ? "not-allowed" : "pointer",
                  opacity: !canManageSettings || saving ? 0.6 : 1,
                }}
              >
                {saving ? t("chat.communityOverview.saving") : t("chat.communityOverview.save")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
